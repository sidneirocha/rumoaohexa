/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo, ReactNode } from 'react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import confetti from 'canvas-confetti';
import { Search, Trophy, CheckCircle2, Circle, Menu, X, ChevronRight, ChevronDown, Filter, Share2, Copy, Check, Settings as SettingsIcon } from 'lucide-react';
import { motion, AnimatePresence, useScroll, useSpring } from 'motion/react';
import { Collection, Sticker } from './types';
import { GROUPS, SPECIALS, FIFA_TO_ISO, LEGENDS_PLAYERS, LEGENDS_VARIANTS, VARIANT_COLORS } from './constants';

type FilterType = 'all' | 'collected' | 'missing';
type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void> | void;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
};

const sanitizeCollection = (value: unknown): Collection => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }

  return Object.entries(value as Record<string, unknown>).reduce<Collection>((acc, [key, rawValue]) => {
    let nextValue: number;

    if (typeof rawValue === 'boolean') {
      nextValue = rawValue ? 1 : 0;
    } else if (typeof rawValue === 'number') {
      nextValue = rawValue;
    } else if (typeof rawValue === 'string') {
      const normalized = rawValue.toLowerCase();
      if (normalized === 'true') {
        nextValue = 1;
      } else if (normalized === 'false') {
        nextValue = 0;
      } else {
        nextValue = Number(rawValue);
      }
    } else {
      nextValue = Number.NaN;
    }

    if (Number.isFinite(nextValue) && nextValue > 0) {
      acc[key] = Math.floor(nextValue);
    }

    return acc;
  }, {});
};

const parseMarkdownCollection = (content: string): Collection | null => {
  const lines = content.split(/\r?\n/);
  const parsed = lines.reduce<Collection>((acc, line) => {
    const match = line.trim().match(/^[-*]\s*([A-Za-z0-9_-]+)\s*:\s*(\d+)$/);
    if (!match) return acc;

    const [, id, countText] = match;
    const count = Number(countText);
    if (Number.isFinite(count) && count > 0) {
      acc[id] = Math.floor(count);
    }
    return acc;
  }, {});

  return Object.keys(parsed).length > 0 ? parsed : null;
};

const normalizeImportedCollection = (raw: string): Collection | null => {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  try {
    const value = JSON.parse(trimmed);
    const candidate =
      value && typeof value === 'object' && !Array.isArray(value)
        ? ('collection' in value && value.collection && typeof value.collection === 'object'
            ? value.collection
            : ('data' in value && value.data && typeof value.data === 'object'
                ? value.data
                : value))
        : null;

    if (candidate && !Array.isArray(candidate)) {
      const normalized = sanitizeCollection(candidate);
      return Object.keys(normalized).length > 0 ? normalized : null;
    }
  } catch {
    // Not JSON, fall through to Markdown/TXT parsing.
  }

  return parseMarkdownCollection(trimmed);
};

export default function App() {
  const [collection, setCollection] = useState<Collection>(() => {
    const saved = localStorage.getItem('sticker-collection');
    return saved ? sanitizeCollection(JSON.parse(saved)) : {};
  });

  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [showInstallBanner, setShowInstallBanner] = useState(false);
  const [showIOSInstructions, setShowIOSInstructions] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [installBannerDismissed, setInstallBannerDismissed] = useState(() => {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem('install-banner-dismissed') === 'true';
  });
  const [showTutorial, setShowTutorial] = useState(false);
  const [tutorialDismissed, setTutorialDismissed] = useState(() => {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem('onboarding-dismissed') === 'true';
  });
  const firstCountryRefs = React.useRef<Record<string, HTMLDivElement | null>>({});

  const LOADING_IMAGES = [
    "https://raw.githubusercontent.com/sidneirocha/stickerscopa26/99fab2db99f5941e3a573be4c30def3eedbb17d8/wp1.webp",
    "https://raw.githubusercontent.com/sidneirocha/stickerscopa26/99fab2db99f5941e3a573be4c30def3eedbb17d8/wp2.webp",
    "https://raw.githubusercontent.com/sidneirocha/stickerscopa26/99fab2db99f5941e3a573be4c30def3eedbb17d8/wp3.webp"
  ];

  const randomImage = useMemo(() => LOADING_IMAGES[Math.floor(Math.random() * LOADING_IMAGES.length)], []);
  const loadingImages = useMemo(() => LOADING_IMAGES, []);
  const isIOS = useMemo(() => {
    if (typeof window === 'undefined') return false;
    return /iPad|iPhone|iPod/.test(window.navigator.userAgent) && !(window as Window & { MSStream?: unknown }).MSStream;
  }, []);

  const isStandalone = useMemo(() => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia('(display-mode: standalone)').matches || (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
  }, []);

  const isMobile = useMemo(() => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia('(max-width: 767px)').matches;
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => setIsLoading(false), 4000);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setDeferredPrompt(event as BeforeInstallPromptEvent);
      if (!isStandalone) {
        setShowInstallBanner(true);
      }
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    return () => window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
  }, [isStandalone]);

  useEffect(() => {
    if (!isLoading && !isStandalone && !installBannerDismissed && tutorialDismissed) {
      const timer = window.setTimeout(() => {
        setShowInstallBanner(true);
      }, 1000);

      return () => window.clearTimeout(timer);
    }
  }, [isLoading, isStandalone, installBannerDismissed, tutorialDismissed]);

  useEffect(() => {
    if (!isLoading && !tutorialDismissed) {
      const timer = window.setTimeout(() => {
        setShowTutorial(true);
      }, 500);

      return () => window.clearTimeout(timer);
    }
  }, [isLoading, tutorialDismissed]);

  useEffect(() => {
    if (isLoading) {
      // Prevent scrolling during pre-loading
      document.body.style.overflow = 'hidden';
      
      const colors = ['#009b3a', '#fedf00', '#ffffff', '#002772'];
      const duration = 4000;
      const end = Date.now() + duration;

      const frame = () => {
        confetti({
          particleCount: 2,
          angle: 60,
          spread: 55,
          origin: { x: 0, y: 0.2 },
          colors: colors,
          scalar: 0.8, // Reduced size
          gravity: 0.6,
        });
        confetti({
          particleCount: 2,
          angle: 120,
          spread: 55,
          origin: { x: 1, y: 0.2 },
          colors: colors,
          scalar: 0.8, // Reduced size
          gravity: 0.6,
        });

        if (Date.now() < end) {
          requestAnimationFrame(frame);
        }
      };
      
      frame();

      return () => {
        document.body.style.overflow = 'auto';
      };
    }
  }, [isLoading]);
  const [filter, setFilter] = useState<FilterType>('all');
  const [activeGroup, setActiveGroup] = useState<string | null>(null);
  const [showShareToast, setShowShareToast] = useState(false);
  const [toastMessage, setToastMessage] = useState("");
  const [showSettings, setShowSettings] = useState(false);
  const [exportPreview, setExportPreview] = useState<{ type: 'missing' | 'duplicates'; stickers: Sticker[] } | null>(null);
  const [showImportModal, setShowImportModal] = useState(false);
  const [importText, setImportText] = useState('');

  const scrollToSection = (id: string) => {
    const el = document.getElementById(id);
    if (el) {
      const headerHeight = 160; // Adjusted for the new header height
      const y = el.getBoundingClientRect().top + window.pageYOffset - headerHeight;
      window.scrollTo({ top: y, behavior: 'smooth' });
      
      // If it's a group or special, open the accordion
      if (id.startsWith('grupo-')) {
        const groupName = id.replace('grupo-', '').toUpperCase();
        setActiveGroup(groupName);
      } else if (id === 'especiais') {
        setActiveGroup(SPECIALS[0].code);
      } else if (id === 'legends') {
        setActiveGroup(LEGENDS_PLAYERS[0].code);
      }
    }
  };

  const openGroup = (groupName: string) => {
    const nextGroup = activeGroup === groupName ? null : groupName;
    setActiveGroup(nextGroup);

    if (nextGroup && isMobile) {
      window.setTimeout(() => {
        const target = firstCountryRefs.current[groupName];
        target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 120);
    }
  };

  const prepareExport = (type: 'missing' | 'duplicates') => {
    const relevant = type === 'missing' 
      ? allStickers.filter(s => (collection[s.id] || 0) === 0)
      : allStickers.filter(s => (collection[s.id] || 0) > 1);

    if (relevant.length === 0) {
      showToast(type === 'missing' ? "Você não tem figurinhas faltantes!" : "Você não tem figurinhas repetidas!");
      return;
    }

    setExportPreview({ type, stickers: relevant });
  };

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setShowShareToast(true);
    setTimeout(() => setShowShareToast(false), 2000);
  };

  const dismissInstallBanner = () => {
    setShowInstallBanner(false);
    setShowIOSInstructions(false);
    setInstallBannerDismissed(true);
    localStorage.setItem('install-banner-dismissed', 'true');
  };

  const dismissTutorial = () => {
    setShowTutorial(false);
    setTutorialDismissed(true);
    localStorage.setItem('onboarding-dismissed', 'true');
  };

  const reopenTutorial = () => {
    setShowSettings(false);
    setShowTutorial(true);
  };

  const openInstallPrompt = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice;
      if (choice.outcome === 'accepted') {
        showToast('App pronto para instalar na tela inicial');
      }
      setDeferredPrompt(null);
      setShowInstallBanner(false);
      return;
    }

    if (isIOS) {
      setShowIOSInstructions(true);
      setShowInstallBanner(true);
      return;
    }

    showToast('Use o menu do navegador para instalar o app');
  };

  const downloadWallpaper = async (url: string, filename: string) => {
    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error('Unable to fetch wallpaper');
      }

      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = objectUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(objectUrl);
      showToast('Wallpaper baixado com sucesso!');
    } catch (error) {
      window.open(url, '_blank', 'noopener,noreferrer');
      showToast('Abrindo wallpaper em nova aba.');
    }
  };

  useEffect(() => {
    localStorage.setItem('sticker-collection', JSON.stringify(collection));
  }, [collection]);

  useEffect(() => {
    if (installBannerDismissed || isStandalone) {
      setShowInstallBanner(false);
    }
  }, [isStandalone, installBannerDismissed]);

  const allStickers = useMemo(() => {
    const stickers: Sticker[] = [];

    // Special stickers
    SPECIALS.forEach((special) => {
      for (let i = special.range[0]; i <= special.range[1]; i++) {
        const numberLabel = (special.code === 'FWC' && i === 0) ? '00' : i.toString();
        stickers.push({
          id: `${special.code}${i}`,
          number: numberLabel,
          teamCode: special.code,
          teamName: special.name,
          isSpecial: true,
        });
      }
    });

    // Group stickers
    GROUPS.forEach((group) => {
      group.teams.forEach((team) => {
        for (let i = 1; i <= 20; i++) {
          stickers.push({
            id: `${team.code}${i}`,
            number: i.toString(),
            teamCode: team.code,
            teamName: team.name,
            group: group.name,
          });
        }
      });
    });

    // Legends Extra stickers
    LEGENDS_PLAYERS.forEach((player) => {
      LEGENDS_VARIANTS.forEach((variant) => {
        stickers.push({
          id: `LEG-${player.code}-${variant.toUpperCase()}`,
          number: variant.charAt(0).toUpperCase() + variant.slice(1),
          teamCode: 'EXTRA',
          teamName: player.name,
          variant: variant,
          // Removed imageUrl to use initials as requested
        });
      });
    });

    return stickers;
  }, []);

  const filteredStickers = useMemo(() => {
    if (!searchQuery.trim()) return [];
    const query = searchQuery.toLowerCase().trim();
    return allStickers.filter((s) => {
      const fullCode = `${s.teamCode}${s.number}`.toLowerCase();
      const codeWithSpace = `${s.teamCode} ${s.number}`.toLowerCase();
      return (
        fullCode.includes(query) ||
        codeWithSpace.includes(query) ||
        s.teamName.toLowerCase().includes(query) ||
        s.teamCode.toLowerCase().includes(query)
      );
    });
  }, [searchQuery, allStickers]);

  const stats = useMemo(() => {
    const total = allStickers.length;
    const values = Object.values(collection) as number[];
    const collected = values.filter(count => count > 0).length;
    const duplicates = values.reduce((acc, count) => acc + Math.max(0, count - 1), 0);
    const percentage = Math.round((collected / total) * 100);
    return { total, collected, percentage, duplicates };
  }, [allStickers, collection]);

  const updateStickerCount = (id: string, delta: number) => {
    setCollection((prev) => {
      const current = prev[id] || 0;
      const next = Math.max(0, current + delta);
      if (next === 0) {
        const { [id]: _removed, ...rest } = prev;
        return rest;
      }
      return { ...prev, [id]: next };
    });
  };

  const shareList = (type: 'missing' | 'duplicates') => {
    const relevant = type === 'missing' 
      ? allStickers.filter(s => (collection[s.id] || 0) === 0)
      : allStickers.filter(s => (collection[s.id] || 0) > 1);

    if (relevant.length === 0) {
      showToast(type === 'missing' ? "Você não tem figurinhas faltantes!" : "Você não tem figurinhas repetidas!");
      return;
    }

    const doc = new jsPDF();
    const title = type === 'missing' ? 'Copa do Mundo 2026 - Faltantes' : 'Copa do Mundo 2026 - Repetidas';
    
    doc.setFont("helvetica", "bold");
    doc.setFontSize(18);
    doc.setTextColor(0, 29, 71);
    doc.text(title, 14, 20);
    
    const totalDisplay = type === 'duplicates' 
      ? relevant.reduce((acc, s) => acc + ((collection[s.id] || 0) - 1), 0)
      : relevant.length;
    
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(100);
    doc.text(`Total: ${totalDisplay} ${type === 'missing' ? 'figurinhas' : 'repetidas'} | Gerado em: ${new Date().toLocaleDateString()}`, 14, 28);

    const byTeam: { [key: string]: string[] } = {};
    relevant.forEach(s => {
      if (!byTeam[s.teamCode]) byTeam[s.teamCode] = [];
      const count = collection[s.id] || 0;
      
      let label = s.number;
      if (s.teamCode === 'EXTRA') {
        label = `${s.teamName} (${s.number})`;
      }
      
      if (type === 'duplicates') {
        label += `(x${count - 1})`;
      }
      byTeam[s.teamCode].push(label);
    });

    const tableData = Object.entries(byTeam).map(([team, numbers]) => [team, numbers.join(", ")]);

    autoTable(doc, {
      startY: 35,
      head: [['Seleção', 'Números']],
      body: tableData,
      theme: 'grid',
      styles: { fontSize: 8, cellPadding: 2, overflow: 'linebreak' },
      headStyles: { fillColor: [0, 29, 71], textColor: [255, 255, 255], fontStyle: 'bold' },
      columnStyles: { 
        0: { fontStyle: 'bold', cellWidth: 40 },
        1: { cellWidth: 'auto' }
      },
      margin: { top: 35 }
    });

    doc.save(`${type}_copa_2026.pdf`);
    showToast(`PDF de ${type === 'missing' ? 'faltantes' : 'repetidas'} gerado!`);
  };

  const exportMarkdownData = () => {
    const items = Object.entries(sanitizeCollection(collection));
    if (items.length === 0) {
      showToast("Sua coleção está vazia.");
      return;
    }

    const lines = [
      '# Stickers Copa 26',
      '',
      `Exportado em: ${new Date().toLocaleDateString()}`,
      '',
      '## Coleção',
      ...items.map(([id, count]) => `- ${id}: ${count}`),
      '',
    ];

    const dataStr = lines.join('\n');
    const copyMarkdown = async () => {
      try {
        if (navigator.clipboard?.writeText) {
          await navigator.clipboard.writeText(dataStr);
        } else {
          const textarea = document.createElement('textarea');
          textarea.value = dataStr;
          textarea.setAttribute('readonly', 'true');
          textarea.style.position = 'fixed';
          textarea.style.opacity = '0';
          document.body.appendChild(textarea);
          textarea.select();
          document.execCommand('copy');
          textarea.remove();
        }
        showToast("Markdown copiado com sucesso. Agora é só colar onde quiser.");
      } catch {
        showToast("Não foi possível copiar o Markdown.");
      }
    };

    void copyMarkdown();
  };

  const importedPreview = useMemo(() => normalizeImportedCollection(importText), [importText]);
  const importedDistinctCount = importedPreview ? Object.keys(importedPreview).length : 0;
  const importedTotalCount = importedPreview
    ? Object.values(importedPreview).reduce((sum, count) => sum + count, 0)
    : 0;

  const openImportModal = () => {
    setImportText('');
    setShowImportModal(true);
  };

  const closeImportModal = () => {
    setShowImportModal(false);
    setImportText('');
  };

  const confirmImportText = () => {
    if (!importedPreview) {
      showToast("Cole um JSON, MD ou TXT válido antes de importar.");
      return;
    }

    setCollection(importedPreview);
    showToast(`Importados ${importedTotalCount} itens em ${importedDistinctCount} códigos.`);
    closeImportModal();
  };

  const getFilteredStickers = (stickers: Sticker[]) => {
    let result = stickers;
    
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim();
      result = result.filter((s) => {
        const fullCode = `${s.teamCode}${s.number}`.toLowerCase();
        const codeWithSpace = `${s.teamCode} ${s.number}`.toLowerCase();
        return (
          fullCode.startsWith(query) || 
          codeWithSpace.startsWith(query) ||
          s.teamCode.toLowerCase().startsWith(query) ||
          s.number === query
        );
      });
    }

    if (filter === 'collected') {
      result = result.filter(s => (collection[s.id] || 0) > 0);
    } else if (filter === 'missing') {
      result = result.filter(s => (collection[s.id] || 0) === 0);
    }

    return result;
  };

  return (
    <div className="min-h-screen bg-fifa-slate-50 pb-20 font-sans text-fifa-primary">
      <AnimatePresence mode="wait">
        {isLoading ? (
          <motion.div
            key="preloader"
            initial={{ opacity: 1 }}
            exit={{ opacity: 0, scale: 1.1, filter: "blur(20px)" }}
            transition={{ duration: 1.2, ease: "easeInOut" }}
            className="fixed inset-0 z-[200] bg-[#009739] flex flex-col items-center justify-between py-12 md:py-24 overflow-hidden"
          >
            {/* Background Images Sequence */}
            <motion.div 
              initial={{ scale: 1.15, opacity: 0 }}
              animate={{ 
                scale: [1.15, 1.05],
                opacity: [0, 1]
              }}
              transition={{ 
                duration: 4, 
                ease: "easeOut" 
              }}
              className="absolute inset-0 flex items-center justify-center overflow-hidden"
            >
              <div className="relative w-full h-full flex items-center justify-center">
                <img
                  src={randomImage}
                  alt="Wallpaper de loading"
                  className="w-full h-full object-cover"
                />
              </div>
            </motion.div>

            {/* Content Container - Pushed to bottom */}
            <div className="relative z-10 w-full flex flex-col justify-end items-center flex-1 pb-8 md:pb-12">
              <div className="w-full max-w-sm px-8 flex flex-col items-center gap-4">
                <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-black/45 text-white/90 backdrop-blur-md">
                  <div className="h-2 w-2 rounded-full bg-fifa-accent animate-pulse" />
                  <span className="text-[10px] md:text-xs font-black uppercase tracking-[0.4em]">Carregando</span>
                </div>

                <div className="relative w-full">
                  <div className="relative w-full h-5 md:h-7 bg-black/70 rounded-full p-1 border border-white/20">
                    <motion.div
                      initial={{ width: "0%" }}
                      animate={{ width: "100%" }}
                      transition={{ duration: 4, ease: "easeInOut" }}
                      className="h-full bg-gradient-to-r from-[#009b3a] via-[#fedf00] to-[#009b3a] bg-[length:200%_100%] animate-shimmer rounded-full relative overflow-visible"
                    >
                      <div className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-1/2 pointer-events-none">
                        <div className="w-10 h-10 md:w-14 md:h-14 bg-white rounded-full flex items-center justify-center shadow-[0_0_14px_rgba(255,255,255,0.35)] overflow-hidden">
                          <img
                            src="https://www.svgrepo.com/show/77569/soccer-ball.svg"
                            alt="Soccer Ball"
                            className="w-[90%] h-[90%] animate-spin-slow"
                          />
                        </div>
                      </div>
                    </motion.div>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      {/* Header */}
      <header className="relative bg-[#002772] text-white sticky top-0 z-50 shadow-2xl overflow-hidden border-b border-white/5">
        {/* Brasil Geometric Spirit Background */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-0 right-0 w-[45%] h-full bg-[#009b3a] rounded-bl-[100px] translate-x-1/4 -translate-y-4" />
          <div className="absolute top-0 right-0 w-[25%] h-[50%] bg-[#fedf00] rounded-bl-[80px] translate-x-1/3 -translate-y-6" />
        </div>

        <div className="relative max-w-7xl mx-auto px-4 md:px-6 py-2 md:py-4">
          <div className="flex flex-row items-center justify-between gap-4 md:gap-8">
            {/* Left Section: Logo & Brand on one line */}
            <div className="flex items-center gap-2 md:gap-4 min-w-0">
              <img 
                src="https://upload.wikimedia.org/wikipedia/en/1/17/2026_FIFA_World_Cup_emblem.svg" 
                alt="Logo" 
                className="h-8 md:h-16 w-auto drop-shadow-[0_0_15px_rgba(255,255,255,0.3)] shrink-0"
              />
              <div className="flex flex-row items-baseline gap-1.5 md:gap-2">
                <h1 className="text-sm md:text-3xl font-black uppercase italic leading-none tracking-tighter whitespace-nowrap">
                  COPA <span className="text-fifa-accent">2026</span>
                </h1>
                <p className="hidden md:block text-[8px] md:text-[10px] font-bold text-white/40 uppercase tracking-[0.2em]">Álbum Digital</p>
              </div>
            </div>

            {/* Middle Section: Search Bar - Filling the space on Desktop */}
            <div className="hidden md:block flex-1 max-w-2xl group mx-4">
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/30 group-focus-within:text-fifa-accent transition-colors" />
                <input
                  type="text"
                  placeholder="Busque por times ou jogadores..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-xl py-2.5 pl-10 pr-3 text-sm font-bold italic focus:outline-none focus:ring-2 focus:ring-fifa-accent/30 transition-all placeholder:text-white/20 hover:bg-white/10"
                />
                </div>
                {searchQuery.trim() && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    className="shrink-0 rounded-xl border border-white/10 bg-white/10 px-4 py-2.5 text-[10px] font-black uppercase tracking-widest text-white hover:bg-white/20 transition-colors"
                  >
                    Ver todas
                  </button>
                )}
              </div>
            </div>

            {/* Right Section: Stats & Settings - Compressed */}
            <div className="flex items-center gap-2 shrink-0">
              <div className="bg-black/40 backdrop-blur-xl px-2.5 py-1.5 md:px-6 md:py-3 rounded-xl border border-white/10 flex items-center gap-2 md:gap-4 shadow-xl">
                <div className="flex flex-col items-center md:items-end">
                  <span className="text-xs md:text-3xl font-black text-white italic leading-none">{stats.collected}<span className="text-white/30 text-[8px] md:text-lg not-italic ml-1">/ {stats.total}</span></span>
                  <span className="hidden md:block text-[6px] md:text-[8px] font-black text-fifa-accent uppercase tracking-[0.2em] mt-0.5">Figurinhas Coletadas</span>
                </div>
                <div className="w-[1px] h-4 md:h-10 bg-white/10" />
                <button 
                  onClick={() => setShowSettings(true)}
                  className="p-3 md:p-2.5 min-w-11 min-h-11 md:min-w-0 md:min-h-0 bg-white/5 hover:bg-white/10 text-white rounded-xl transition-all flex items-center justify-center touch-manipulation"
                >
                  <SettingsIcon className="h-3.5 w-3.5 md:h-6 md:w-6 group-hover/settings:rotate-90 transition-transform duration-500" />
                </button>
              </div>
            </div>
          </div>

          <div className="mt-3 md:mt-4 flex flex-col md:flex-row items-center gap-3">
            {/* Mobile Search */}
            <div className="md:hidden flex items-center gap-2 w-full">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-white/30" />
                <input
                  type="text"
                  placeholder="Busque..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-white/10 border border-white/10 rounded-xl py-2 pl-10 pr-3 text-xs font-bold italic focus:outline-none transition-all placeholder:text-white/20"
                />
              </div>
              {searchQuery.trim() && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="shrink-0 rounded-xl border border-white/10 bg-white/10 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-white hover:bg-white/20 transition-colors"
                >
                  Limpar
                </button>
              )}
            </div>

            <nav className="flex items-center justify-center gap-1.5 md:gap-2 w-full md:w-auto">
              <NavButton label="Especiais" onClick={() => scrollToSection('especiais')} />
              <NavButton label="Legends" onClick={() => scrollToSection('legends')} />
              <NavButton label="Times" onClick={() => scrollToSection('times-list')} />
            </nav>
            
            <div className="flex items-center gap-1.5 w-full md:w-auto md:ml-auto">
              <button 
                onClick={() => prepareExport('missing')}
                className="flex-1 md:px-4 flex items-center justify-center gap-2 py-2 bg-white/10 text-white rounded-lg font-black text-[9px] md:text-xs uppercase hover:bg-white/20 transition-all border border-white/5 whitespace-nowrap"
              >
                <Share2 className="h-3 w-3 md:h-4 md:w-4 text-fifa-accent" />
                Faltantes
              </button>
              <button 
                onClick={() => prepareExport('duplicates')}
                className="flex-1 md:px-4 flex items-center justify-center gap-2 py-2 bg-white/10 text-white rounded-lg font-black text-[9px] md:text-xs uppercase hover:bg-white/20 transition-all border border-white/5 whitespace-nowrap"
              >
                <Copy className="h-3 w-3 md:h-4 md:w-4 text-fifa-cyan" />
                Trocas
              </button>
            </div>
          </div>
        </div>

        {/* Global Progress Strip */}
        <div className="h-6 md:h-8 w-full bg-black/40 relative overflow-hidden flex items-center">
          <motion.div 
            initial={{ width: 0 }}
            animate={{ width: `${stats.percentage}%` }}
            className="absolute inset-y-0 left-0 bg-gradient-to-r from-[#009b3a] via-[#fedf00] to-[#009b3a] shadow-[0_0_20px_rgba(254,223,0,0.3)]"
          />
          <div className="relative w-full flex justify-center items-center">
            <span className="text-[10px] md:text-xs font-black uppercase italic tracking-[0.3em] text-white drop-shadow-md">
              Progresso do Álbum: {stats.percentage}%
            </span>
          </div>
        </div>
      </header>

      <main className="max-w-xl lg:max-w-7xl mx-auto p-4 space-y-8 mt-6">
        {searchQuery.trim() ? (
          <div className="space-y-6">
            <h2 className="text-sm font-black text-fifa-primary/40 uppercase tracking-widest flex items-center gap-2 px-2">
              <Filter className="h-4 w-4" />
              Resultados da busca ({getFilteredStickers(allStickers).length})
            </h2>
            <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-8 xl:grid-cols-10 gap-2 md:gap-3">
              {getFilteredStickers(allStickers).map((sticker) => (
                <StickerButton 
                  key={sticker.id}
                  sticker={sticker}
                  count={collection[sticker.id] || 0}
                  onAdd={() => updateStickerCount(sticker.id, 1)}
                  onRemove={() => updateStickerCount(sticker.id, -1)}
                />
              ))}
            </div>
            {getFilteredStickers(allStickers).length === 0 && (
              <div className="text-center py-20 text-fifa-primary/20">
                <Search className="h-12 w-12 mx-auto mb-4 opacity-10" />
                <p className="font-bold">Nenhuma figurinha encontrada.</p>
              </div>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 xl:grid-cols-4 gap-8 items-start">
            {/* Specials - Sidebar sticky */}
            <div id="especiais" className="space-y-6 lg:sticky lg:top-[240px] transition-all">
              <div className="bg-gradient-to-br from-fifa-primary to-blue-800 rounded-3xl p-6 text-white shadow-xl overflow-hidden relative">
                <div className="absolute top-0 right-0 w-32 h-32 bg-fifa-cyan rounded-full translate-x-1/2 -translate-y-1/2 opacity-20 blur-2xl" />
                <div className="absolute bottom-0 left-0 w-40 h-full bg-white rounded-tr-full -translate-x-1/4 opacity-10" />
                <div className="relative z-10 flex justify-between items-center">
                  <div>
                    <h2 className="text-xl font-black uppercase leading-tight italic">Especiais</h2>
                  </div>
                    <div className="bg-white/20 px-3 py-1.5 rounded-2xl text-[10px] font-black backdrop-blur-md border border-white/10 italic">
                      {allStickers.filter(s => s.isSpecial && (collection[s.id] || 0) > 0).length} / {allStickers.filter(s => s.isSpecial).length}
                    </div>
                </div>
              </div>
              
              <div className="grid grid-cols-1 gap-4">
                {SPECIALS.map((special) => {
                  const stickers = getFilteredStickers(allStickers.filter(s => s.teamCode === special.code));
                  if (stickers.length === 0 && filter !== 'all') return null;

                  const collectedCount = allStickers.filter(s => s.teamCode === special.code && (collection[s.id] || 0) > 0).length;
                  const totalCount = allStickers.filter(s => s.teamCode === special.code).length;
                  const duplicateCount = allStickers.filter(s => s.teamCode === special.code).reduce((acc, s) => acc + Math.max(0, (collection[s.id] || 0) - 1), 0);

                  return (
                    <Accordion 
                      key={special.code}
                      title={special.name}
                      subtitle={`${collectedCount} DE ${totalCount}`}
                      duplicates={duplicateCount}
                      isOpen={activeGroup === special.code}
                      onToggle={() => openGroup(special.code)}
                    >
                      <div className="grid grid-cols-5 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-5 gap-2 p-3 md:p-4 bg-white rounded-b-3xl md:border-x md:border-b border-fifa-slate-200">
                        {stickers.map(s => (
                          <StickerButton 
                            key={s.id}
                            sticker={s}
                            count={collection[s.id] || 0}
                            onAdd={() => updateStickerCount(s.id, 1)}
                            onRemove={() => updateStickerCount(s.id, -1)}
                          />
                        ))}
                      </div>
                    </Accordion>
                  );
                })}
              </div>
            </div>

            {/* Main Content Area: Legends then Groups */}
            <div className="lg:col-span-2 xl:col-span-3 space-y-12">
              {/* Legends Section Spanning Horizontal */}
              <div id="legends" className="space-y-6">
                <div className="bg-gradient-to-r from-[#6e001c] via-[#8b0000] to-[#6a0dad] rounded-3xl p-6 md:p-8 text-white shadow-xl overflow-hidden relative">
                  <div className="absolute top-0 right-0 w-64 h-full bg-fifa-accent rounded-full translate-x-1/2 opacity-10 blur-3xl" />
                  <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div>
                      <h2 className="text-2xl md:text-3xl font-black uppercase leading-tight italic">Legends Extra</h2>
                    </div>
                    <div className="bg-white/20 px-4 py-2 rounded-2xl text-xs md:text-sm font-black backdrop-blur-md border border-white/10 italic self-start md:self-auto">
                      {allStickers.filter(s => s.teamCode === 'EXTRA' && (collection[s.id] || 0) > 0).length} / 80 COLETADAS
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                  {LEGENDS_PLAYERS.map(player => {
                    const stickers = getFilteredStickers(allStickers.filter(s => s.teamName === player.name && s.teamCode === 'EXTRA'));
                    if (stickers.length === 0 && filter !== 'all') return null;

                    const collectedCount = stickers.filter(s => (collection[s.id] || 0) > 0).length;
                    const totalCount = stickers.length;

                    return (
                      <Accordion 
                        key={player.code}
                        title={player.name}
                        subtitle={`${collectedCount} DE ${totalCount}`}
                        isOpen={activeGroup === player.code}
                        onToggle={() => openGroup(player.code)}
                      >
                        <div className="grid grid-cols-4 gap-2 p-3 md:p-4 bg-white rounded-b-3xl md:border-x md:border-b border-fifa-slate-200">
                          {stickers.map(s => (
                            <StickerButton 
                              key={s.id}
                              sticker={s}
                              count={collection[s.id] || 0}
                              onAdd={() => updateStickerCount(s.id, 1)}
                              onRemove={() => updateStickerCount(s.id, -1)}
                            />
                          ))}
                        </div>
                      </Accordion>
                    );
                  })}
                </div>
              </div>

              {/* Groups grid */}
              <div id="times-list" className="grid grid-cols-1 xl:grid-cols-2 gap-8 items-start content-start">
                 {GROUPS.map((group) => {
                const groupStickers = allStickers.filter(s => s.group === group.name);
                const filteredGroupStickers = getFilteredStickers(groupStickers);
                
                if (filteredGroupStickers.length === 0 && filter !== 'all') return null;

                const collectedCount = groupStickers.filter(s => (collection[s.id] || 0) > 0).length;
                const totalCount = groupStickers.length;
                const duplicateCount = groupStickers.reduce((acc, s) => acc + Math.max(0, (collection[s.id] || 0) - 1), 0);

                const groupFlags = group.teams.map(t => FIFA_TO_ISO[t.code]);
                let firstVisibleTeamAttached = false;

                return (
                  <div key={group.name} id={`grupo-${group.name.toLowerCase()}`} className="space-y-4">
                    <Accordion 
                      title={`Grupo ${group.name}`}
                      subtitle={`${collectedCount}/${totalCount}`}
                      duplicates={duplicateCount}
                      flags={groupFlags}
                      isOpen={activeGroup === group.name}
                      onToggle={() => openGroup(group.name)}
                    >
                      <div className="space-y-8 p-4 md:p-6 bg-white rounded-b-3xl md:border-x md:border-b border-fifa-slate-200">
                        <div className="grid grid-cols-1 md:grid-cols-1 gap-8">
                          {group.teams.map(team => {
                            const teamStickers = filteredGroupStickers.filter(s => s.teamCode === team.code);
                            if (teamStickers.length === 0 && filter !== 'all') return null;

                            return (
                              <div
                                key={team.code}
                                className="space-y-4"
                                ref={(el) => {
                                  if (!firstVisibleTeamAttached) {
                                    firstCountryRefs.current[group.name] = el;
                                    firstVisibleTeamAttached = true;
                                  }
                                }}
                              >
                                <div className="flex items-center justify-between border-b border-fifa-slate-100 pb-2">
                                  <div className="flex items-center gap-3">
                                    <div className="flex items-center gap-2">
                                      <img 
                                        src={`https://flagcdn.com/w80/${FIFA_TO_ISO[team.code] || 'un'}.png`} 
                                        alt={team.name}
                                        className="w-10 h-auto rounded shadow-lg border-2 border-white"
                                      />
                                    </div>
                                    <h3 className="text-sm font-black text-fifa-primary uppercase tracking-tight italic">{team.name}</h3>
                                  </div>
                                  <span className="text-[10px] font-bold bg-fifa-slate-50 px-2 py-1 rounded-full text-fifa-primary/60 border border-fifa-slate-200 italic">
                                    {allStickers.filter(s => s.teamCode === team.code && (collection[s.id] || 0) > 0).length} / 20
                                  </span>
                                </div>
                                <div className="grid grid-cols-5 md:grid-cols-6 lg:grid-cols-10 gap-2">
                                  {teamStickers.map(s => (
                                    <StickerButton 
                                      key={s.id}
                                      sticker={s}
                                      count={collection[s.id] || 0}
                                      onAdd={() => updateStickerCount(s.id, 1)}
                                      onRemove={() => updateStickerCount(s.id, -1)}
                                    />
                                  ))}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </Accordion>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </main>

      {/* Floating Action Toast / Feedback */}
      <AnimatePresence>
        {showShareToast && (
          <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[220] px-4 w-full max-w-md pointer-events-none">
            <motion.div 
              initial={{ y: -20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ opacity: 0 }}
              className="bg-fifa-primary text-white px-4 py-3 rounded-full text-xs font-bold flex items-center gap-2 shadow-2xl border border-white/20 justify-center text-center"
            >
              <Check className="h-3 w-3 text-fifa-accent" />
              {toastMessage}
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showTutorial && (
          <div className="fixed inset-0 z-[190] flex items-center justify-center p-4 md:p-8">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={dismissTutorial}
              className="absolute inset-0 bg-black/70 backdrop-blur-xl"
            />
            <motion.div
              initial={{ scale: 0.94, opacity: 0, y: 18 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.94, opacity: 0, y: 18 }}
              className="relative w-full max-w-2xl overflow-hidden rounded-[2rem] border border-white/10 bg-white shadow-2xl"
            >
              <div className="h-1 w-full bg-gradient-to-r from-fifa-accent via-fifa-cyan to-fifa-peach" />
              <div className="p-6 md:p-8">
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-2">
                    <p className="text-[10px] font-black uppercase tracking-[0.3em] text-fifa-primary/35">Bem-vindo</p>
                    <h3 className="text-2xl md:text-3xl font-black text-fifa-primary uppercase tracking-tight">Como usar o app</h3>
                    <p className="text-sm md:text-base font-medium text-fifa-primary/65 max-w-xl">
                      Este é um guia rápido para começar a organizar sua coleção sem perder tempo.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={dismissTutorial}
                    className="p-2 hover:bg-fifa-slate-100 rounded-full transition-colors"
                    aria-label="Fechar tutorial"
                  >
                    <X className="h-6 w-6 text-fifa-primary/40" />
                  </button>
                </div>

                <div className="mt-6 grid gap-3 md:grid-cols-2">
                  {[
                    { title: '1. Busque', text: 'Use a barra de busca para encontrar seleções, jogadores ou códigos rapidamente.' },
                    { title: '2. Marque figurinhas', text: 'Toque em uma figurinha para adicionar e toque de novo para remover.' },
                    { title: '3. Filtre', text: 'Use Faltantes, Trocas e Ver todas para navegar pela coleção.' },
                    { title: '4. Salve', text: 'Copiar MD gera um resumo fácil de compartilhar e importar de novo depois.' },
                  ].map((step) => (
                    <div key={step.title} className="rounded-2xl border border-fifa-slate-100 bg-fifa-slate-50 px-4 py-4">
                      <p className="text-[10px] font-black uppercase tracking-[0.25em] text-fifa-primary/35">{step.title}</p>
                      <p className="mt-2 text-sm md:text-[15px] font-semibold leading-relaxed text-fifa-primary/70">{step.text}</p>
                    </div>
                  ))}
                </div>

                <div className="mt-6 flex flex-col md:flex-row md:items-center md:justify-end gap-3">
                  <button
                    type="button"
                    onClick={dismissTutorial}
                    className="inline-flex items-center justify-center gap-2 rounded-2xl bg-fifa-primary px-5 py-3 text-sm font-black uppercase tracking-widest text-white shadow-lg shadow-fifa-primary/20 transition-transform active:scale-95"
                  >
                    Começar agora
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showInstallBanner && !isStandalone && (
          <motion.div
            initial={{ y: 120, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 120, opacity: 0 }}
            transition={{ duration: 0.35, ease: 'easeOut' }}
            className="fixed bottom-4 left-4 right-4 z-[180] mx-auto max-w-2xl"
          >
            <div className="rounded-[1.75rem] border border-white/15 bg-[#002772]/95 text-white shadow-[0_20px_60px_rgba(0,0,0,0.35)] backdrop-blur-xl overflow-hidden">
              <div className="h-1 w-full bg-gradient-to-r from-fifa-accent via-fifa-cyan to-fifa-peach" />
              <div className="p-4 md:p-5 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div className="flex items-start gap-3">
                  <div className="h-11 w-11 rounded-2xl bg-white/10 flex items-center justify-center shrink-0 border border-white/10">
                    <Share2 className="h-5 w-5 text-fifa-accent" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs uppercase tracking-[0.3em] text-white/45 font-black">Instalar app</p>
                    <p className="text-sm md:text-base font-bold leading-snug">
                      {isIOS
                        ? 'No iPhone, use o botão de compartilhar e escolha "Adicionar à Tela de Início".'
                        : 'Instale o app na tela inicial para abrir rápido e usar como aplicativo.'}
                    </p>
                    {showIOSInstructions && isIOS && (
                      <ol className="mt-2 space-y-1 text-xs md:text-sm text-white/70 list-decimal list-inside">
                        <li>Toque no ícone de compartilhar do Safari.</li>
                        <li>Selecione “Adicionar à Tela de Início”.</li>
                        <li>Confirme em “Adicionar”.</li>
                      </ol>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={openInstallPrompt}
                    className="inline-flex items-center justify-center gap-2 rounded-2xl bg-fifa-accent px-4 py-3 text-sm font-black uppercase tracking-widest text-fifa-primary shadow-lg shadow-fifa-accent/25 transition-transform active:scale-95"
                  >
                    {isIOS ? 'Ver passo a passo' : deferredPrompt ? 'Instalar agora' : 'Instalar'}
                  </button>
                  <button
                    type="button"
                    onClick={dismissInstallBanner}
                    className="h-12 w-12 rounded-2xl border border-white/10 bg-white/5 text-white/70 transition-colors hover:bg-white/10"
                    aria-label="Fechar instalação"
                  >
                    <X className="mx-auto h-5 w-5" />
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Export Preview Modal */}
      <AnimatePresence>
        {exportPreview && (
          <div className="fixed inset-0 z-[150] flex items-center justify-center p-4 md:p-8">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setExportPreview(null)}
              className="absolute inset-0 bg-black/80 backdrop-blur-xl"
            />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="relative w-full max-w-2xl bg-white rounded-[2rem] shadow-2xl overflow-hidden flex flex-col h-[80vh]"
            >
              <div className="p-6 md:p-8 border-b border-fifa-slate-100 flex items-center justify-between bg-fifa-slate-50">
                <div>
                  <h3 className="text-xl md:text-2xl font-black text-fifa-primary uppercase italic">
                    Lista de {exportPreview.type === 'missing' ? 'Faltantes' : 'Trocas'}
                  </h3>
                  <p className="text-[10px] md:text-xs font-bold text-fifa-primary/40 uppercase tracking-[0.2em] mt-1">
                    {exportPreview.stickers.length} figurinhas encontradas
                  </p>
                </div>
                <button 
                  onClick={() => setExportPreview(null)}
                  className="p-3 hover:bg-fifa-slate-200 rounded-full transition-colors"
                >
                  <X className="h-6 w-6 text-fifa-primary/40" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-6 md:p-8 space-y-6">
                {Object.entries(
                  exportPreview.stickers.reduce((acc, s) => {
                    if (!acc[s.teamCode]) acc[s.teamCode] = [];
                    
                    let label = s.number;
                    if (s.teamCode === 'EXTRA') {
                      label = `${s.teamName} (${s.number})`;
                    }

                    if (exportPreview.type === 'duplicates') {
                      label += `(x${(collection[s.id] || 1)-1})`;
                    }
                    
                    acc[s.teamCode].push(label);
                    return acc;
                  }, {} as Record<string, string[]>)
                ).map(([teamCode, numbers]) => (
                  <div key={teamCode} className="flex gap-4 border-b border-fifa-slate-100 pb-3">
                    <span className="w-16 font-black text-fifa-primary italic text-sm">{teamCode}</span>
                    <span className="flex-1 text-sm font-bold text-fifa-primary/60">{(numbers as string[]).join(", ")}</span>
                  </div>
                ))}
              </div>

              <div className="p-6 md:p-8 border-t border-fifa-slate-100 bg-white">
                <button 
                  onClick={() => {
                    shareList(exportPreview.type);
                    setExportPreview(null);
                  }}
                  className="w-full py-4 bg-fifa-accent text-fifa-primary rounded-2xl font-black uppercase italic tracking-widest shadow-xl hover:scale-[1.02] active:scale-95 transition-all flex items-center justify-center gap-3"
                >
                  <Trophy className="h-5 w-5" />
                  Download PDF Oficial
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Settings Modal */}
      <AnimatePresence>
        {showSettings && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowSettings(false)}
              className="absolute inset-0 bg-black/60 backdrop-blur-md"
            />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="relative w-full max-w-md bg-white rounded-3xl p-8 shadow-2xl overflow-hidden"
            >
              <div className="absolute top-0 right-0 w-full h-2 bg-gradient-to-r from-fifa-accent via-fifa-cyan to-fifa-peach" />
              
              <div className="flex items-center justify-between mb-8">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-fifa-primary/5 rounded-xl">
                    <SettingsIcon className="h-6 w-6 text-fifa-primary" />
                  </div>
                  <h3 className="text-xl font-black text-fifa-primary uppercase tracking-tight">Configurações</h3>
                </div>
                <button 
                  onClick={() => setShowSettings(false)}
                  className="p-2 hover:bg-fifa-slate-100 rounded-full transition-colors"
                >
                  <X className="h-6 w-6 text-fifa-primary/40" />
                </button>
              </div>

                <div className="space-y-6">
                <div>
                  <h4 className="text-[10px] font-black uppercase text-fifa-primary/40 tracking-[0.2em] mb-4">Sincronização Cloud</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <button 
                      onClick={exportMarkdownData}
                      className="flex flex-col items-center justify-center gap-3 py-6 bg-fifa-slate-50 border-2 border-fifa-slate-100 rounded-2xl hover:border-fifa-primary transition-all group"
                    >
                      <div className="p-3 bg-white rounded-xl shadow-sm group-hover:bg-fifa-primary group-hover:text-white transition-colors">
                        <Share2 className="h-5 w-5" />
                      </div>
                      <span className="text-[10px] font-black uppercase tracking-widest">Copiar MD</span>
                    </button>
                    <button 
                      onClick={openImportModal}
                      className="flex flex-col items-center justify-center gap-3 py-6 bg-fifa-slate-50 border-2 border-fifa-slate-100 rounded-2xl hover:border-fifa-primary transition-all group cursor-pointer"
                    >
                      <div className="p-3 bg-white rounded-xl shadow-sm group-hover:bg-fifa-primary group-hover:text-white transition-colors">
                        <Copy className="h-5 w-5" />
                      </div>
                      <span className="text-[10px] font-black uppercase tracking-widest">Importar</span>
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={reopenTutorial}
                    className="mt-4 w-full flex items-center justify-center gap-3 rounded-2xl border-2 border-fifa-primary/10 bg-fifa-primary/5 px-4 py-4 text-sm font-black uppercase tracking-widest text-fifa-primary hover:bg-fifa-primary/10 transition-colors"
                  >
                    <CheckCircle2 className="h-5 w-5" />
                    Rever tutorial
                  </button>
                </div>

                <div>
                  <h4 className="text-[10px] font-black uppercase text-fifa-primary/40 tracking-[0.2em] mb-4">Wallpapers</h4>
                  <div className="grid grid-cols-3 gap-3">
                    {loadingImages.map((url, index) => (
                      <button
                        key={url}
                        type="button"
                        onClick={() => downloadWallpaper(url, `wallpaper-${index + 1}.webp`)}
                        className="flex flex-col items-center justify-center gap-2 rounded-2xl border-2 border-fifa-slate-100 bg-fifa-slate-50 py-4 hover:border-fifa-primary transition-all"
                      >
                        <div className="h-12 w-12 overflow-hidden rounded-xl bg-white shadow-sm">
                          <img src={url} alt={`Wallpaper ${index + 1}`} className="h-full w-full object-cover" />
                        </div>
                        <span className="text-[10px] font-black uppercase tracking-widest">Baixar {index + 1}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="pt-6 border-t border-fifa-slate-100">
                   <p className="text-[10px] text-fifa-primary/40 font-bold text-center uppercase tracking-widest">Controlador Oficial do Álbum da Copa 2026</p>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {showImportModal && (
          <div className="fixed inset-0 z-[170] flex items-center justify-center p-4 md:p-8">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={closeImportModal}
              className="absolute inset-0 bg-black/60 backdrop-blur-md"
            />
            <motion.div
              initial={{ scale: 0.96, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.96, opacity: 0, y: 20 }}
              className="relative w-full max-w-2xl rounded-[2rem] bg-white shadow-2xl overflow-hidden border border-fifa-slate-100"
            >
              <div className="h-1 w-full bg-gradient-to-r from-fifa-accent via-fifa-cyan to-fifa-peach" />
              <div className="p-6 md:p-8 space-y-6">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-[0.3em] text-fifa-primary/35">Importar coleção</p>
                    <h3 className="mt-2 text-xl md:text-2xl font-black text-fifa-primary uppercase tracking-tight">Cole o texto do MD</h3>
                    <p className="mt-2 text-sm text-fifa-primary/55">
                      Você pode colar o Markdown, JSON ou TXT exportado. O app mostra a quantidade encontrada antes de confirmar.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={closeImportModal}
                    className="p-2 hover:bg-fifa-slate-100 rounded-full transition-colors"
                    aria-label="Fechar importação"
                  >
                    <X className="h-6 w-6 text-fifa-primary/40" />
                  </button>
                </div>

                <div className="space-y-3">
                  <textarea
                    value={importText}
                    onChange={(e) => setImportText(e.target.value)}
                    placeholder={`# Stickers Copa 26\n\n## Coleção\n- BRA10: 2\n- ARG5: 1`}
                    className="min-h-56 w-full rounded-3xl border-2 border-fifa-slate-100 bg-fifa-slate-50 px-4 py-4 text-sm font-medium text-fifa-primary outline-none transition-colors focus:border-fifa-primary/40 focus:bg-white"
                  />

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div className="rounded-2xl border border-fifa-slate-100 bg-fifa-slate-50 px-4 py-3">
                      <p className="text-[10px] font-black uppercase tracking-[0.2em] text-fifa-primary/35">Códigos</p>
                      <p className="mt-1 text-2xl font-black text-fifa-primary">{importedDistinctCount}</p>
                    </div>
                    <div className="rounded-2xl border border-fifa-slate-100 bg-fifa-slate-50 px-4 py-3">
                      <p className="text-[10px] font-black uppercase tracking-[0.2em] text-fifa-primary/35">Total</p>
                      <p className="mt-1 text-2xl font-black text-fifa-primary">{importedTotalCount}</p>
                    </div>
                    <div className="rounded-2xl border border-fifa-slate-100 bg-fifa-slate-50 px-4 py-3">
                      <p className="text-[10px] font-black uppercase tracking-[0.2em] text-fifa-primary/35">Status</p>
                      <p className="mt-1 text-sm font-black text-fifa-primary uppercase">
                        {importedPreview ? 'Pronto para importar' : 'Aguardando texto válido'}
                      </p>
                    </div>
                  </div>

                  {importText.trim() && !importedPreview && (
                    <p className="text-sm font-bold text-red-600">
                      Não reconheci esse texto. Cole um MD/JSON/TXT exportado pelo app.
                    </p>
                  )}
                </div>

                <div className="flex flex-col md:flex-row gap-3 md:justify-end pt-2">
                  <button
                    type="button"
                    onClick={closeImportModal}
                    className="rounded-2xl border border-fifa-slate-200 px-5 py-3 text-sm font-black uppercase tracking-widest text-fifa-primary hover:bg-fifa-slate-50 transition-colors"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={confirmImportText}
                    disabled={!importedPreview}
                    className="rounded-2xl bg-fifa-primary px-5 py-3 text-sm font-black uppercase tracking-widest text-white shadow-lg shadow-fifa-primary/20 transition-transform active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Importar {importedTotalCount > 0 ? `(${importedTotalCount})` : ''}
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

const NavButton: React.FC<{ label: string; onClick: () => void }> = ({ label, onClick }) => (
  <button 
    onClick={onClick}
    className="w-full px-2 py-3 bg-white/10 border border-white/10 rounded-xl text-[10px] md:text-xs font-black uppercase tracking-widest text-[#fedf00] hover:bg-white hover:text-[#002772] transition-all active:scale-95 shadow-lg"
  >
    {label}
  </button>
);

const FilterTab: React.FC<{ active: boolean; onClick: () => void; label: string }> = ({ active, onClick, label }) => {
  return (
    <button
      onClick={onClick}
      className={`
        flex-1 py-2 px-1 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all
        ${active 
          ? 'bg-fifa-accent text-fifa-primary shadow-lg shadow-fifa-accent/20' 
          : 'bg-white/5 text-white/40 hover:bg-white/10 hover:text-white/60'}
      `}
    >
      {label}
    </button>
  );
}

const StickerButton: React.FC<{ 
  sticker: Sticker; 
  count: number; 
  onAdd: () => void;
  onRemove: () => void;
}> = ({ sticker, count, onAdd, onRemove }) => {
  const isCollected = count > 0;
  const [showAnimation, setShowAnimation] = useState(false);
  
  const handleAdd = () => {
    if (!isCollected) {
      setShowAnimation(true);
      setTimeout(() => setShowAnimation(false), 1500);
    }
    onAdd();
  };

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map(n => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  const customStyles = useMemo(() => {
    if (sticker.teamCode === 'EXTRA' && sticker.variant) {
      const isSilverOrGold = sticker.variant === 'silver' || sticker.variant === 'gold';
      const baseColor = VARIANT_COLORS[sticker.variant as keyof typeof VARIANT_COLORS];
      
      return {
        background: isCollected 
          ? `linear-gradient(135deg, ${baseColor} 0%, ${baseColor}dd 100%)`
          : `linear-gradient(135deg, ${baseColor}20 0%, ${baseColor}10 100%)`,
        color: isCollected 
          ? (isSilverOrGold ? '#1a1a1a' : '#ffffff')
          : `${baseColor}`,
        borderColor: isCollected ? baseColor : `${baseColor}40`,
        boxShadow: isCollected ? `0 10px 20px -5px ${baseColor}40` : 'none'
      };
    }
    return {};
  }, [sticker, isCollected]);

  return (
    <div className="relative group">
      <button
        onClick={handleAdd}
        style={customStyles}
        className={`
          w-full aspect-[3/4] rounded-lg flex flex-col items-center justify-center border-2 transition-all duration-300 sticker-card overflow-hidden relative
          ${isCollected && sticker.teamCode !== 'CITY' && sticker.teamCode !== 'EXTRA' 
            ? 'bg-fifa-cyan border-fifa-cyan text-fifa-primary shadow-lg' 
            : sticker.teamCode !== 'CITY' && sticker.teamCode !== 'EXTRA' ? 'bg-fifa-slate-50 border-fifa-slate-200 text-fifa-primary/20 hover:border-fifa-primary/20' : ''}
          ${sticker.teamCode === 'EXTRA' ? 'shadow-xl active:scale-95' : ''}
          ${sticker.teamCode === 'CITY' ? 'border shadow-md' : ''}
          ${sticker.teamCode === 'CITY' && !isCollected ? 'opacity-30 grayscale' : ''}
        `}
      >
        <AnimatePresence>
          {showAnimation && (
            <motion.div 
              initial={{ scale: 0, opacity: 0, rotate: -45 }}
              animate={{ 
                scale: [0, 1.2, 1], 
                opacity: [0, 1, 0],
                rotate: 0,
                y: [0, -20]
              }}
              exit={{ opacity: 0 }}
              transition={{ duration: 1.2, ease: "easeOut" }}
              className="absolute inset-0 z-20 flex items-center justify-center pointer-events-none p-2 bg-fifa-accent/40 backdrop-blur-[2px]"
            >
              <img 
                src="https://upload.wikimedia.org/wikipedia/en/1/17/2026_FIFA_World_Cup_emblem.svg" 
                alt="FIFA"
                className="w-full h-auto drop-shadow-[0_0_15px_rgba(255,255,255,0.8)]"
              />
            </motion.div>
          )}
        </AnimatePresence>
        
        {sticker.imageUrl ? (
          <div className="absolute inset-0 w-full h-full">
            <img 
              src={sticker.imageUrl} 
              alt={sticker.teamName} 
              className={`w-full h-full object-cover transition-all duration-500 ${!isCollected ? 'grayscale opacity-40' : 'grayscale-0'}`} 
            />
            <div className={`absolute inset-0 transition-opacity duration-500 ${isCollected ? 'bg-black/20' : 'bg-transparent'}`} />
            
            {/* Bottom Info Bar */}
            <div className={`absolute bottom-0 left-0 w-full p-0.5 text-center transition-colors duration-500 ${isCollected ? 'bg-black/60' : 'bg-fifa-slate-200/80'}`}>
              <span className={`text-[6px] md:text-[8px] font-black uppercase truncate block leading-none ${isCollected ? 'text-white' : 'text-fifa-primary/40'}`}>
                {sticker.teamName}
              </span>
            </div>

            {/* Variant/Number Tag */}
            <div className="absolute top-0 right-0 p-0.5">
               <span className={`text-[6px] md:text-[8px] font-black uppercase italic px-1 rounded truncate block leading-none transition-all duration-500
                ${isCollected 
                  ? 'bg-black/40 text-white shadow-sm' 
                  : 'bg-fifa-slate-200/60 text-fifa-primary/20'}`}>
                {sticker.number}
              </span>
            </div>
          </div>
        ) : sticker.teamCode === 'EXTRA' ? (
          <div className="flex flex-col items-center justify-center w-full h-full p-1 relative">
            {/* Subtle Texture Overlay */}
            <div className={`absolute inset-0 opacity-[0.05] pointer-events-none bg-[url('https://www.transparenttextures.com/patterns/brushed-alum.png')]`} />
            
            {/* Holographic Glow (if collected) */}
            {isCollected && (
               <div className="absolute inset-0 bg-gradient-to-tr from-white/10 via-transparent to-white/20 pointer-events-none" />
            )}

            <div className="text-[6px] md:text-[7px] font-black uppercase opacity-60 italic tracking-widest mb-auto pt-1">
              FIFA EXTRA
            </div>

            <div className="flex-1 flex flex-col items-center justify-center -mt-1">
              <span className={`text-2xl md:text-3xl font-black italic tracking-tighter leading-none drop-shadow-sm`}>
                {getInitials(sticker.teamName)}
              </span>
              <div className={`h-0.5 w-4 mt-1 rounded-full ${isCollected ? 'bg-current opacity-40' : 'bg-fifa-primary/10'}`} />
            </div>

            <div className="mt-auto w-full flex flex-col items-center pb-1 gap-1">
              <div className={`text-[6px] md:text-[8px] font-black uppercase px-2 py-0.5 rounded-full border ${isCollected ? 'border-current/20 bg-current/10' : 'border-fifa-primary/5'}`}>
                {sticker.number}
              </div>
            </div>
          </div>
        ) : (
          <>
            <span className="text-[6px] md:text-[8px] font-black uppercase opacity-60 leading-none">{sticker.teamCode}</span>
            <span className="text-[10px] md:text-sm font-black leading-none mt-0.5 md:mt-1">{sticker.number}</span>
            {sticker.teamCode === 'EXTRA' && (
               <span className="text-[6px] md:text-[7px] font-black uppercase mt-1 px-1 text-center line-clamp-2 leading-none">
                {sticker.teamName}
              </span>
            )}
          </>
        )}
      </button>
      
      {count > 0 && (
        <div className="absolute -top-1.5 -right-1.5 flex flex-col gap-1 items-end pointer-events-none">
          {count > 1 && (
            <div className="bg-fifa-accent text-fifa-primary text-[10px] font-black px-1.5 py-0.5 rounded-full shadow-lg border border-white">
              x{count}
            </div>
          )}
          <button 
            onClick={(e) => {
              e.stopPropagation();
              onRemove();
            }}
            className="pointer-events-auto h-8 w-8 md:h-5 md:w-5 bg-fifa-slate-200 text-fifa-primary rounded-full flex items-center justify-center shadow-md hover:scale-110 transition-transform touch-manipulation"
          >
            <X className="h-4 w-4 md:h-3 md:w-3" />
          </button>
        </div>
      )}
    </div>
  );
}

const Accordion: React.FC<{
  title: string;
  subtitle?: string;
  flags?: string[];
  duplicates?: number;
  children: ReactNode;
  isOpen: boolean;
  onToggle: () => void;
}> = ({ title, subtitle, flags, duplicates, children, isOpen, onToggle }) => {
  return (
    <div className="overflow-hidden">
      <button
        onClick={onToggle}
        className={`
          w-full flex items-center justify-between py-3 px-4 md:px-5 bg-white border border-fifa-slate-200 transition-all shadow-sm
          ${isOpen ? 'rounded-t-2xl md:rounded-t-3xl border-b-0' : 'rounded-2xl md:rounded-3xl hover:border-fifa-accent'}
        `}
      >
        <div className="flex flex-col items-start gap-2 md:gap-3 flex-1">
          <div className="flex items-center gap-2 w-full justify-between pr-2 md:pr-4">
            <div className="flex items-baseline gap-2">
              <span className="text-xs md:text-sm font-black text-fifa-primary uppercase tracking-tight italic">{title}</span>
              {subtitle && <span className="text-[9px] md:text-[10px] font-black text-fifa-primary/30 leading-none uppercase tracking-widest whitespace-nowrap">{subtitle}</span>}
            </div>
            {duplicates !== undefined && duplicates > 0 && (
              <span className="text-[8px] md:text-[9px] font-black bg-fifa-peach text-white px-1.5 md:px-2 py-0.5 rounded-full uppercase italic shrink-0">
                +{duplicates}
              </span>
            )}
          </div>
          {flags && flags.length > 0 && (
            <div className="flex gap-1.5 md:gap-2">
              {flags.map((flag, idx) => (
                <img 
                  key={idx}
                  src={`https://flagcdn.com/w80/${flag || 'un'}.png`}
                  className="w-7 md:w-10 h-4 md:h-6 object-cover rounded shadow-sm border border-fifa-slate-100"
                  alt=""
                />
              ))}
            </div>
          )}
        </div>
        <div className={`p-1 rounded-full transition-transform duration-300 shrink-0 ${isOpen ? 'bg-fifa-primary rotate-180 shadow-md' : 'bg-fifa-slate-50'}`}>
          <ChevronDown className={`h-4 md:h-5 w-4 md:h-5 ${isOpen ? 'text-white' : 'text-fifa-primary/30'}`} />
        </div>
      </button>
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            {children}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
