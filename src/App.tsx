/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo, useRef, ReactNode } from 'react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import confetti from 'canvas-confetti';
import { Search, Trophy, CheckCircle2, Circle, Menu, X, ChevronRight, ChevronDown, Filter, Share2, Copy, Check, Lock, Settings as SettingsIcon, MessageCircleMore } from 'lucide-react';
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
    const bullet = line.trim();
    if (!/^[-*]\s+/.test(bullet)) return acc;

    const contentLine = bullet.replace(/^[-*]\s+/, '');
    const matches = [...contentLine.matchAll(/([A-Za-z0-9_-]+)\s*:\s*(\d+)/g)];
    if (matches.length === 0) return acc;

    matches.forEach((match) => {
      const [, id, countText] = match;
      const count = Number(countText);
      if (Number.isFinite(count) && count > 0) {
        acc[id] = Math.floor(count);
      }
    });

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

const formatCollectionLine = (label: string, stickers: Sticker[], collection: Collection) => {
  const entries = stickers
    .map((sticker) => ({
      id: sticker.id,
      count: collection[sticker.id] || 0,
    }))
    .filter(({ count }) => count > 0);

  if (entries.length === 0) return null;

  return `- ${label}: ${entries.map(({ id, count }) => `${id}: ${count}`).join(', ')}`;
};

const formatBrazilianDate = (date: Date) => {
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  return `${day}/${month}/${year}`;
};

const SOURCE_LINK = 'https://sidneirocha.github.io/stickerscopa26/docs';

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
  const [tutorialSlide, setTutorialSlide] = useState(0);
  const [showCompletionCelebration, setShowCompletionCelebration] = useState(false);
  const [toastTone, setToastTone] = useState<'default' | 'warning' | 'success'>('default');
  const [tutorialDismissed, setTutorialDismissed] = useState(() => {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem('onboarding-dismissed') === 'true';
  });
  const celebrationTriggeredRef = useRef(false);
  const wallpaperUnlockSeenRef = useRef<boolean[]>([false, false, false]);
  const previousOfficialCollectedRef = useRef<number | null>(null);
  const pendingGroupScrollRef = useRef<string | null>(null);
  const groupFirstCountryRefs = useRef<Record<string, HTMLElement | null>>({});

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
    wallpaperUnlockSeenRef.current = [0, 1, 2].map(
      (index) => localStorage.getItem(`wallpaper-unlock-shown-${index}`) === 'true'
    );
  }, []);

  useEffect(() => {
    if (showTutorial) {
      setTutorialSlide(0);
    }
  }, [showTutorial]);

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
  const [showWallpaperUnlock, setShowWallpaperUnlock] = useState<number | null>(null);
  const [activeWallpaperTooltip, setActiveWallpaperTooltip] = useState<number | null>(null);

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
        setActiveGroup(SPECIALS[0].name);
      } else if (id === 'legends') {
        setActiveGroup(LEGENDS_PLAYERS[0].code);
      }
    }
  };

  const openGroup = (groupName: string) => {
    const nextGroup = activeGroup === groupName ? null : groupName;
    pendingGroupScrollRef.current = nextGroup;
    setActiveGroup(nextGroup);
  };

  useEffect(() => {
    const groupName = pendingGroupScrollRef.current;
    if (!groupName || !isMobile || activeGroup !== groupName) return;

    const timer = window.setTimeout(() => {
      const target = groupFirstCountryRefs.current[groupName];
      if (target) {
        const headerOffset = (document.querySelector('header')?.getBoundingClientRect().height ?? 0) + 12;
        const top = target.getBoundingClientRect().top + window.scrollY - headerOffset;
        window.scrollTo({ top, behavior: 'smooth' });

        window.setTimeout(() => {
          const retryTarget = groupFirstCountryRefs.current[groupName];
          if (retryTarget) {
            const retryTop = retryTarget.getBoundingClientRect().top + window.scrollY - headerOffset;
            window.scrollTo({ top: retryTop, behavior: 'smooth' });
          }
        }, 250);
      }
      pendingGroupScrollRef.current = null;
    }, 650);

    return () => window.clearTimeout(timer);
  }, [activeGroup, isMobile, filter, searchQuery]);

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

  const showToast = (msg: string, tone: 'default' | 'warning' | 'success' = 'default') => {
    setToastTone(tone);
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

  const handleTutorialNext = () => {
    if (tutorialSlide >= tutorialSlides.length - 1) {
      dismissTutorial();
      return;
    }

    setTutorialSlide((prev) => prev + 1);
  };

  const dismissWallpaperUnlock = () => {
    setShowWallpaperUnlock(null);
  };

  const showWallpaperTooltip = (index: number) => {
    setActiveWallpaperTooltip(index);
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

  const handleWallpaperAction = (url: string, index: number) => {
    const thresholds = [1, 0.25, 0.5];
    const required = thresholds[index] ?? 1;
    const progress = officialStats.total > 0 ? officialStats.collected / officialStats.total : 0;
    const unlocked = index === 0 ? officialStats.collected >= 1 : progress >= required;

    if (!unlocked) {
      const requiredText = index === 0 ? '1 figurinha' : `${Math.round(required * 100)}%`;
      showToast(`ALERTA: wallpaper bloqueado. Libera em ${requiredText}.`, 'warning');
      return;
    }

    showToast(`Baixando wallpaper ${index + 1}...`, 'success');
    void downloadWallpaper(url, `wallpaper-${index + 1}.webp`);
  };

  const openWallpaperDownload = (index: number) => {
    setShowWallpaperUnlock(null);
    void handleWallpaperAction(loadingImages[index], index);
  };

  useEffect(() => {
    if (activeWallpaperTooltip === null) return;

    const timer = window.setTimeout(() => {
      setActiveWallpaperTooltip(null);
    }, 2400);

    return () => window.clearTimeout(timer);
  }, [activeWallpaperTooltip]);

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
          group: special.name,
          specialSection: special.name,
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

  const officialStats = useMemo(() => {
    const total = allStickers.filter((sticker) => sticker.teamCode !== 'EXTRA' && sticker.teamCode !== 'CC').length;

    const collected = allStickers.filter(
      (sticker) => sticker.teamCode !== 'EXTRA' && sticker.teamCode !== 'CC' && (collection[sticker.id] || 0) > 0
    ).length;
    const percentage = Math.round((collected / total) * 100);

    return { total, collected, percentage };
  }, [allStickers, collection]);

  useEffect(() => {
    if (officialStats.total > 0 && officialStats.collected === officialStats.total) {
      if (celebrationTriggeredRef.current) return;

      celebrationTriggeredRef.current = true;
      setShowCompletionCelebration(true);

      const colors = ['#002772', '#009b3a', '#fedf00', '#ffffff'];
      const end = Date.now() + 2600;

      const burst = () => {
        confetti({
          particleCount: 3,
          angle: 60,
          spread: 55,
          origin: { x: 0 },
          colors,
        });
        confetti({
          particleCount: 3,
          angle: 120,
          spread: 55,
          origin: { x: 1 },
          colors,
        });

        if (Date.now() < end) {
          requestAnimationFrame(burst);
        }
      };

      burst();
      return;
    }

    celebrationTriggeredRef.current = false;
    setShowCompletionCelebration(false);
  }, [officialStats.collected, officialStats.total]);

  useEffect(() => {
    const previousCollected = previousOfficialCollectedRef.current;
    if (previousCollected === null) {
      previousOfficialCollectedRef.current = officialStats.collected;
      return;
    }

    const thresholds = [1, 0.25, 0.5];
    const progress = officialStats.total > 0 ? officialStats.collected / officialStats.total : 0;
    const previousProgress = officialStats.total > 0 ? previousCollected / officialStats.total : 0;

    const nextUnlockIndex = thresholds.findIndex((required, index) => {
      const unlockedNow = index === 0 ? officialStats.collected >= 1 : progress >= required;
      const unlockedBefore = index === 0 ? previousCollected >= 1 : previousProgress >= required;
      return !wallpaperUnlockSeenRef.current[index] && unlockedNow && !unlockedBefore;
    });

    if (nextUnlockIndex !== -1) {
      wallpaperUnlockSeenRef.current[nextUnlockIndex] = true;
      localStorage.setItem(`wallpaper-unlock-shown-${nextUnlockIndex}`, 'true');
      setShowWallpaperUnlock(nextUnlockIndex);
    }

    previousOfficialCollectedRef.current = officialStats.collected;
  }, [officialStats.collected]);

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

  const buildTradeEntries = (type: 'missing' | 'duplicates') => {
    const relevant = type === 'missing'
      ? allStickers.filter(s => (collection[s.id] || 0) === 0)
      : allStickers.filter(s => (collection[s.id] || 0) > 1);

    const grouped = Object.entries(
      relevant.reduce((acc, sticker) => {
        const groupKey = sticker.teamCode === 'EXTRA'
          ? sticker.teamName
          : sticker.isSpecial
            ? (sticker.specialSection || sticker.teamName || sticker.teamCode)
            : sticker.teamCode;
        if (!acc[groupKey]) acc[groupKey] = [];
        acc[groupKey].push(sticker);
        return acc;
      }, {} as Record<string, Sticker[]>)
    ).map(([groupKey, stickers]) => {
      const first = stickers[0];
      const labels = stickers.map((sticker) => {
        const count = collection[sticker.id] || 0;
        let label = sticker.number;
        if (sticker.teamCode === 'EXTRA' && type === 'missing') {
          label = `${sticker.teamName} (${sticker.number})`;
        }
        if (type === 'duplicates') {
          label += `(x${count - 1})`;
        }
        return label;
      });

      return {
        key: `${first?.teamCode || groupKey}-${groupKey}`,
        teamCode: first?.teamCode || groupKey,
        teamName: first?.teamCode === 'EXTRA'
          ? (first?.teamName || groupKey)
          : first?.isSpecial
            ? (first?.specialSection || first?.teamName || groupKey)
            : (first?.teamName || groupKey),
        flag: FIFA_TO_ISO[first?.teamCode || groupKey],
        labels,
      };
    });

    const totalDisplay = type === 'duplicates'
      ? relevant.reduce((acc, s) => acc + ((collection[s.id] || 0) - 1), 0)
      : relevant.length;

    return { relevant, grouped, totalDisplay };
  };

  const getTradeMessage = (type: 'missing' | 'duplicates', includeSourceLink = false) => {
    const { grouped, totalDisplay } = buildTradeEntries(type);
    const header = type === 'missing' ? 'lista de faltantes' : 'lista de trocas';
    const lines = [
      `Olá, essa é a minha ${header} - Stickers Copa 26`,
      `Total: ${totalDisplay} ${type === 'missing' ? 'figurinhas' : 'repetidas'}`,
      `Exportado em: ${formatBrazilianDate(new Date())}`,
      '',
      ...grouped.flatMap((entry) => [
        `${entry.teamName}${entry.flag ? ` (${entry.teamCode})` : ''}: ${entry.labels.join(', ')}`,
      ]),
    ];

    if (includeSourceLink) {
      lines.push('', `Dados de: ${SOURCE_LINK}`);
    }

    return lines.join('\n');
  };

  const copyTradeList = async (type: 'missing' | 'duplicates') => {
    const message = getTradeMessage(type, true);
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(message);
      } else {
        const textarea = document.createElement('textarea');
        textarea.value = message;
        textarea.setAttribute('readonly', 'true');
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        textarea.remove();
      }
      showToast('Lista copiada com sucesso.');
    } catch {
      showToast('Não foi possível copiar a lista.');
    }
  };

  const openTradeListWhatsApp = (type: 'missing' | 'duplicates') => {
    const message = getTradeMessage(type, true);
    const url = `https://wa.me/?text=${encodeURIComponent(message)}`;
    window.open(url, '_blank', 'noopener,noreferrer');
    showToast('Abrindo lista no WhatsApp.');
  };

  const shareList = (type: 'missing' | 'duplicates') => {
    const { grouped, totalDisplay } = buildTradeEntries(type);
    const relevant = type === 'missing'
      ? allStickers.filter(s => (collection[s.id] || 0) === 0)
      : allStickers.filter(s => (collection[s.id] || 0) > 1);

    if (relevant.length === 0) {
      showToast(type === 'missing' ? "Você não tem figurinhas faltantes!" : "Você não tem figurinhas repetidas!");
      return;
    }

    const doc = new jsPDF();
    const title = type === 'missing' ? 'Copa do Mundo 2026 - Faltantes' : 'Copa do Mundo 2026 - Trocas';
    
    doc.setFont("helvetica", "bold");
    doc.setFontSize(18);
    doc.setTextColor(0, 29, 71);
    doc.text(title, 14, 20);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(100);
    doc.text(`Total: ${totalDisplay} ${type === 'missing' ? 'figurinhas' : 'repetidas'} | Gerado em: ${formatBrazilianDate(new Date())}`, 14, 28);
    const tableData = grouped.map(({ teamCode, teamName, labels }) => [
      `${teamName} (${teamCode})`,
      labels.join(', '),
    ]);

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
    const normalizedCollection = sanitizeCollection(collection);
    if (Object.keys(normalizedCollection).length === 0) {
      showToast("Sua coleção está vazia.");
      return;
    }

    const lines = [
      '# Stickers Copa 26',
      '',
      `Exportado em: ${formatBrazilianDate(new Date())}`,
      '',
      '## Coleção',
      '### Especiais',
      ...SPECIALS.map((special) => {
        const stickers = allStickers.filter(
          (sticker) => sticker.isSpecial && sticker.specialSection === special.name
        );
        return formatCollectionLine(special.name, stickers, normalizedCollection);
      }).filter((line): line is string => Boolean(line)),
      '',
      '### Legends',
      ...LEGENDS_PLAYERS.map((player) => {
        const stickers = allStickers.filter(
          (sticker) => sticker.teamCode === 'EXTRA' && sticker.teamName === player.name
        );
        return formatCollectionLine(player.name, stickers, normalizedCollection);
      }).filter((line): line is string => Boolean(line)),
      '',
      '### Seleções',
      ...GROUPS.flatMap((group) => group.teams.map((team) => {
        const stickers = allStickers.filter((sticker) => sticker.teamCode === team.code);
        return formatCollectionLine(`Grupo ${group.name} - ${team.name}`, stickers, normalizedCollection);
      })).filter((line): line is string => Boolean(line)),
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
        showToast("Backup copiado com sucesso. Agora é só colar onde quiser.");
      } catch {
        showToast("Não foi possível copiar o backup.");
      }
    };

    void copyMarkdown();
  };

  const importedPreview = useMemo(() => normalizeImportedCollection(importText), [importText]);
  const importedDistinctCount = importedPreview ? Object.keys(importedPreview).length : 0;
  const importedTotalCount = importedPreview
    ? Object.values(importedPreview).reduce((sum, count) => sum + count, 0)
    : 0;
  const importedOfficialCount = importedPreview
    ? Object.entries(importedPreview).reduce((sum, [id, count]) => {
        const sticker = allStickers.find((item) => item.id === id);
        if (!sticker || sticker.teamCode === 'EXTRA' || sticker.teamCode === 'CC') {
          return sum;
        }

        return sum + count;
      }, 0)
    : 0;
  const importedNonOfficialCount = importedTotalCount - importedOfficialCount;

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
      showToast("Cole um backup ou TXT válido antes de importar.");
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
        const name = s.teamName.toLowerCase();
        const variant = (s.variant || '').toLowerCase();
        return (
          fullCode.includes(query) || 
          codeWithSpace.includes(query) ||
          s.teamCode.toLowerCase().includes(query) ||
          name.includes(query) ||
          variant.includes(query) ||
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

  const tutorialSlides = [
    {
      title: 'Busque',
      description: 'Digite o nome do time, jogador ou código para encontrar a figurinha rapidamente no app.',
      accent: 'from-[#002772] to-[#1b4fb8]',
    },
    {
      title: 'Adicione',
      description: 'Toque em uma figurinha para cadastrar sua coleção e toque de novo para criar repetidas. O contador sobe junto.',
      accent: 'from-[#009b3a] to-[#2cbf6e]',
    },
    {
      title: 'Backup',
      description: 'Copie o backup antes de limpar a memória cache do navegador e mantenha sua coleção segura.',
      accent: 'from-[#8b0000] to-[#d1004d]',
    },
    {
      title: 'Recompensas',
      description: 'À medida que você avança, os wallpapers vão sendo desbloqueados e o álbum fica mais completo.',
      accent: 'from-[#fedf00] to-[#f5b800]',
    },
  ];

  const renderTutorialPreview = (index: number) => {
    switch (index) {
      case 0:
        return (
          <div className="rounded-[2rem] border border-fifa-slate-100 bg-white shadow-[0_20px_60px_rgba(0,39,114,0.12)] overflow-hidden">
            <div className="bg-[#002772] text-white px-4 py-4 relative overflow-hidden">
              <div className="absolute inset-y-0 right-0 w-28 bg-[#009b3a]/40 rounded-l-full" />
              <div className="relative flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="h-8 w-8 rounded-xl bg-white/10 flex items-center justify-center">
                    <Search className="h-4 w-4 text-white" />
                  </div>
                  <div>
                    <p className="text-[9px] font-black uppercase tracking-[0.3em] text-white/45">A busca</p>
                    <h4 className="text-sm font-black uppercase italic">COPA 2026</h4>
                  </div>
                </div>
                <div className="rounded-xl bg-black/25 px-3 py-2 text-[10px] font-black">160 / 980</div>
              </div>
            </div>
            <div className="p-4 space-y-3 bg-fifa-slate-50">
              <div className="rounded-2xl bg-white border border-fifa-slate-100 p-3 shadow-sm">
                <div className="h-8 rounded-xl bg-fifa-slate-100 flex items-center px-3 text-fifa-primary/25 text-xs font-bold">Busque...</div>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {['Especiais', 'Legends', 'Seleções'].map((item) => (
                  <div key={item} className="rounded-xl bg-white border border-fifa-slate-100 px-3 py-2 text-center text-[10px] font-black uppercase tracking-widest text-fifa-primary">
                    {item}
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-2">
                {['Faltantes', 'Trocas'].map((item) => (
                  <div key={item} className="rounded-xl bg-[#002772] text-white px-3 py-2 text-center text-[10px] font-black uppercase tracking-widest">
                    {item}
                  </div>
                ))}
              </div>
            </div>
          </div>
        );
      case 1:
        return (
          <div className="rounded-[2rem] border border-fifa-slate-100 bg-white shadow-[0_20px_60px_rgba(0,39,114,0.12)] overflow-hidden">
            <div className="bg-gradient-to-r from-[#009b3a] to-[#2cbf6e] text-white px-4 py-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="h-8 w-8 rounded-xl bg-white/15 flex items-center justify-center">
                    <Trophy className="h-4 w-4 text-white" />
                  </div>
                  <div>
                    <p className="text-[9px] font-black uppercase tracking-[0.3em] text-white/45">Coleção</p>
                    <h4 className="text-sm font-black uppercase italic">Adicionar e repetir</h4>
                  </div>
                </div>
                <div className="rounded-xl bg-black/20 px-3 py-2 text-[10px] font-black">4 / 20</div>
              </div>
            </div>
            <div className="p-4 space-y-3 bg-fifa-slate-50">
              <div className="rounded-2xl bg-white border border-fifa-slate-100 p-3">
                <div className="flex items-center justify-between border-b border-fifa-slate-100 pb-2">
                  <div className="flex items-center gap-2">
                    <div className="h-7 w-7 rounded-full bg-[#002772] text-white flex items-center justify-center text-[10px] font-black">BRA</div>
                    <div>
                      <p className="text-[10px] font-black uppercase text-fifa-primary">Brasil</p>
                      <p className="text-[9px] font-bold text-fifa-primary/35">1 de 20</p>
                    </div>
                  </div>
                  <span className="text-[10px] font-black text-fifa-primary/35">Completo</span>
                </div>
                <div className="grid grid-cols-5 gap-2 mt-3">
                  {['1', '2', '3', '4', 'x2'].map((item, idx) => (
                    <div key={idx} className={`aspect-[3/4] rounded-lg border-2 flex items-center justify-center text-[10px] font-black uppercase ${idx === 3 ? 'border-fifa-primary bg-fifa-primary/10 text-fifa-primary' : 'border-fifa-slate-100 bg-white text-fifa-primary/25'}`}>
                      {item}
                    </div>
                  ))}
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <div className="rounded-xl bg-fifa-slate-50 border border-fifa-slate-100 p-2">
                    <p className="text-[9px] font-black uppercase tracking-[0.25em] text-fifa-primary/35">Toque 1</p>
                    <p className="mt-1 text-[10px] font-semibold text-fifa-primary/60">Adiciona a figurinha na coleção.</p>
                  </div>
                  <div className="rounded-xl bg-[#002772]/5 border border-[#002772]/10 p-2">
                    <p className="text-[9px] font-black uppercase tracking-[0.25em] text-[#002772]">Toque 2</p>
                    <div className="mt-1 flex items-center gap-2">
                      <span className="rounded-full bg-[#002772] px-2 py-0.5 text-[9px] font-black uppercase text-white">x2</span>
                      <p className="text-[10px] font-semibold text-fifa-primary/60">Cria repetidas e aumenta o contador.</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        );
      case 2:
        return (
          <div className="rounded-[2rem] border border-fifa-slate-100 bg-white shadow-[0_20px_60px_rgba(0,39,114,0.12)] overflow-hidden">
            <div className="bg-gradient-to-r from-[#8b0000] via-[#d1004d] to-[#6a0dad] text-white px-4 py-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="h-8 w-8 rounded-xl bg-white/15 flex items-center justify-center">
                    <Copy className="h-4 w-4 text-white" />
                  </div>
                  <div>
                    <p className="text-[9px] font-black uppercase tracking-[0.3em] text-white/45">Proteção</p>
                    <h4 className="text-sm font-black uppercase italic">Backup antes da limpeza</h4>
                  </div>
                </div>
                <div className="rounded-xl bg-black/20 px-3 py-2 text-[10px] font-black">Backup</div>
              </div>
            </div>
            <div className="p-4 space-y-3 bg-fifa-slate-50">
              <div className="rounded-2xl bg-white border border-fifa-slate-100 p-3">
                <p className="text-[10px] font-black uppercase tracking-[0.3em] text-fifa-primary/35">Dica importante</p>
                <div className="mt-3 rounded-xl border border-[#8b0000]/15 bg-[#8b0000]/6 p-3 text-sm font-black leading-relaxed text-[#8b0000] shadow-sm">
                  Antes de limpar a memória cache do navegador, faça um backup da coleção.
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <div className="rounded-xl bg-white border border-fifa-slate-100 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-fifa-primary">Copiar backup</div>
                  <div className="rounded-xl bg-white border border-fifa-slate-100 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-fifa-primary">Importar depois</div>
                </div>
              </div>
            </div>
          </div>
        );
      default:
        return (
          <div className="rounded-[2rem] border border-fifa-slate-100 bg-white shadow-[0_20px_60px_rgba(0,39,114,0.12)] overflow-hidden">
            <div className="bg-gradient-to-r from-[#fedf00] via-[#f5b800] to-[#009b3a] text-fifa-primary px-4 py-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="h-8 w-8 rounded-xl bg-white/70 flex items-center justify-center">
                    <CheckCircle2 className="h-4 w-4 text-fifa-primary" />
                  </div>
                  <div>
                    <p className="text-[9px] font-black uppercase tracking-[0.3em] text-fifa-primary/45">Recompensa</p>
                    <h4 className="text-sm font-black uppercase italic">Wallpapers</h4>
                  </div>
                </div>
                <div className="rounded-xl bg-white/60 px-3 py-2 text-[10px] font-black">3 etapas</div>
              </div>
            </div>
            <div className="p-4 space-y-3 bg-fifa-slate-50">
              <div className="grid grid-cols-3 gap-2">
                {loadingImages.map((url, idx) => (
                  <div key={url} className="rounded-2xl border border-fifa-slate-100 bg-white p-2">
                    <img src={url} alt={`Wallpaper ${idx + 1}`} className="h-24 w-full rounded-xl object-cover" />
                    <div className="mt-2 text-center text-[10px] font-black uppercase tracking-widest text-fifa-primary">
                      {idx === 0 ? '1ª figura' : idx === 1 ? '25%' : '50%'}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        );
    }
  };

  return (
    <div className="min-h-screen bg-fifa-slate-50 pb-36 md:pb-20 font-sans text-fifa-primary">
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

        <div className="relative max-w-7xl mx-auto px-4 md:px-6 py-3 md:py-5">
          <div className="flex flex-row items-center justify-between gap-4 md:gap-10">
            {/* Left Section: Logo & Brand on one line */}
            <div className="flex items-center gap-3 md:gap-5 min-w-0">
              <img 
                src="https://upload.wikimedia.org/wikipedia/en/1/17/2026_FIFA_World_Cup_emblem.svg" 
                alt="Logo" 
                className="h-20 md:h-20 w-auto drop-shadow-[0_0_15px_rgba(255,255,255,0.3)] shrink-0"
              />
              <div className="flex flex-col md:flex-row md:items-baseline gap-0 md:gap-2">
                <h1 className="text-2xl md:text-4xl font-black uppercase italic leading-none tracking-tighter whitespace-nowrap">
                  COPA <span className="text-fifa-accent">2026</span>
                </h1>
                <p className="mt-0.5 md:mt-0 text-[9px] md:text-[10px] font-bold text-white/40 uppercase tracking-[0.2em] whitespace-nowrap">
                  Álbum Digital
                </p>
              </div>
            </div>

            {/* Middle Section: Search Bar - Desktop */}
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
              <div className="bg-black/40 backdrop-blur-xl px-3 py-2.5 md:px-6 md:py-3.5 rounded-xl border border-white/10 flex items-center gap-2 md:gap-4 shadow-xl min-h-[56px] md:min-h-[72px] max-w-[150px] md:max-w-none">
                <div className="flex flex-col items-center md:items-end">
                  <span className="text-2xl md:text-4xl font-black text-white italic leading-none whitespace-nowrap">
                    {officialStats.collected}
                    <span className="text-white/35 text-[10px] md:text-xl not-italic ml-1">/ {officialStats.total}</span>
                  </span>
                  <span className="hidden md:block text-[6px] md:text-[8px] font-black text-fifa-accent uppercase tracking-[0.2em] mt-0.5">Figurinhas Coletadas</span>
                </div>
                <div className="w-[1px] h-5 md:h-10 bg-white/10" />
                <button 
                  onClick={() => setShowSettings(true)}
                  className="p-3 md:p-3 min-w-10 min-h-10 md:min-w-0 md:min-h-0 bg-white/5 hover:bg-white/10 text-white rounded-xl transition-all flex items-center justify-center touch-manipulation"
                >
                  <SettingsIcon className="h-4 w-4 md:h-6 md:w-6 group-hover/settings:rotate-90 transition-transform duration-500" />
                </button>
              </div>
            </div>
          </div>

          <div className="mt-3 md:mt-4 flex flex-col md:flex-row items-center gap-3">
            <nav className="flex items-center justify-center gap-1.5 md:gap-2 w-full md:w-auto">
              <NavButton label="Especiais" onClick={() => scrollToSection('especiais')} />
              <NavButton label="Legends" onClick={() => scrollToSection('legends')} />
              <NavButton label="Seleções" onClick={() => scrollToSection('times-list')} />
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
        <div className="h-8 md:h-10 w-full bg-black/40 relative overflow-hidden flex items-center">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${officialStats.percentage}%` }}
            className="absolute inset-y-0 left-0 bg-gradient-to-r from-[#009b3a] via-[#fedf00] to-[#009b3a] shadow-[0_0_20px_rgba(254,223,0,0.3)]"
          />
          <div className="relative w-full flex justify-center items-center">
            <span className="text-[10px] md:text-xs font-black uppercase italic tracking-[0.3em] text-white drop-shadow-md">
              Progresso do Álbum: {officialStats.percentage}%
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
              <div className="bg-gradient-to-br from-fifa-primary to-blue-800 rounded-3xl h-[92px] md:h-[104px] px-6 md:px-8 text-white shadow-xl overflow-hidden relative border border-white/10 flex items-center">
                <div className="relative z-10 flex w-full items-center justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <h2 className="text-xl md:text-2xl font-black uppercase leading-tight italic">Especiais</h2>
                  </div>
                  <div className="bg-white/20 px-3 py-1.5 rounded-2xl text-[10px] md:text-xs font-black backdrop-blur-md border border-white/10 italic shrink-0 whitespace-nowrap">
                    {allStickers.filter(s => s.isSpecial && (collection[s.id] || 0) > 0).length} / {allStickers.filter(s => s.isSpecial).length}
                  </div>
                </div>
              </div>
              
              <div className="grid grid-cols-1 gap-4">
                {SPECIALS.map((special) => {
                  const stickers = getFilteredStickers(allStickers.filter(s => s.group === special.name));
                  if (stickers.length === 0 && filter !== 'all') return null;

                  const collectedCount = allStickers.filter(s => s.group === special.name && (collection[s.id] || 0) > 0).length;
                  const totalCount = allStickers.filter(s => s.group === special.name).length;
                  const duplicateCount = allStickers.filter(s => s.group === special.name).reduce((acc, s) => acc + Math.max(0, (collection[s.id] || 0) - 1), 0);

                  return (
                    <Accordion 
                      key={special.name}
                      title={special.name}
                      subtitle={`${collectedCount} DE ${totalCount}`}
                      duplicates={duplicateCount}
                      completed={totalCount > 0 && collectedCount === totalCount}
                      alignLeft={special.name === 'Página Inicial' || special.name === 'História'}
                      isOpen={activeGroup === special.name}
                      onToggle={() => openGroup(special.name)}
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
              <div className="bg-gradient-to-r from-[#fedf00] via-[#f5b800] to-[#fff176] rounded-3xl h-[92px] md:h-[104px] px-6 md:px-8 text-fifa-primary shadow-xl overflow-hidden relative border border-[#f5b800]/20 flex items-center">
                <div className="absolute top-0 right-0 w-64 h-full bg-white rounded-full translate-x-1/2 opacity-20 blur-3xl" />
                <div className="relative z-10 flex w-full items-center gap-4">
                  <div className="min-w-0 flex-1">
                    <h2 className="text-xl md:text-2xl font-black uppercase leading-tight italic text-fifa-primary">Legends Extra</h2>
                  </div>
                  <div className="ml-auto bg-white/70 px-3 py-1.5 rounded-2xl text-[10px] md:text-xs font-black backdrop-blur-md border border-fifa-primary/10 italic shrink-0 whitespace-nowrap text-fifa-primary">
                    {allStickers.filter(s => s.teamCode === 'EXTRA' && (collection[s.id] || 0) > 0).length} / 80
                  </div>
                </div>
              </div>

                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-2 gap-4">
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
                        completed={totalCount > 0 && collectedCount === totalCount}
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
                {(() => {
                  const totalSelectionsCount = GROUPS.reduce((sum, group) => {
                    return sum + allStickers.filter((s) => s.group === group.name).length;
                  }, 0);
                  const collectedSelectionsCount = GROUPS.reduce((sum, group) => {
                    return sum + allStickers.filter((s) => s.group === group.name && (collection[s.id] || 0) > 0).length;
                  }, 0);

                  return (
                <div className="xl:col-span-2 bg-gradient-to-r from-[#009b3a] via-[#1fb14b] to-[#7bdc68] rounded-3xl h-[92px] md:h-[104px] px-6 md:px-8 text-white shadow-xl overflow-hidden relative border border-white/10 flex items-center">
                  <div className="absolute top-0 right-0 w-64 h-full bg-white rounded-full translate-x-1/2 opacity-10 blur-3xl" />
                  <div className="relative z-10 flex w-full items-center gap-4">
                    <div className="min-w-0 flex-1">
                      <h2 className="text-xl md:text-2xl font-black uppercase leading-tight italic">Seleções</h2>
                    </div>
                    <div className="ml-auto bg-white/20 px-3 py-1.5 rounded-2xl text-[10px] md:text-xs font-black backdrop-blur-md border border-white/10 italic shrink-0 whitespace-nowrap">
                      {collectedSelectionsCount} / {totalSelectionsCount}
                    </div>
                  </div>
                </div>
                  );
                })()}
                {GROUPS.map((group) => {
                const groupStickers = allStickers.filter(s => s.group === group.name);
                const filteredGroupStickers = getFilteredStickers(groupStickers);
                
                if (filteredGroupStickers.length === 0 && filter !== 'all') return null;

                const collectedCount = groupStickers.filter(s => (collection[s.id] || 0) > 0).length;
                const totalCount = groupStickers.length;
                const duplicateCount = groupStickers.reduce((acc, s) => acc + Math.max(0, (collection[s.id] || 0) - 1), 0);

                const groupFlags = group.teams.map(t => FIFA_TO_ISO[t.code]);
                return (
                  <div key={group.name} id={`grupo-${group.name.toLowerCase()}`} className="space-y-4">
                    <Accordion 
                      title={`Grupo ${group.name}`}
                      subtitle={`${collectedCount}/${totalCount}`}
                      duplicates={duplicateCount}
                      flags={groupFlags}
                      completed={totalCount > 0 && collectedCount === totalCount}
                      isOpen={activeGroup === group.name}
                      onToggle={() => openGroup(group.name)}
                    >
                      <div className="space-y-8 p-4 md:p-6 bg-white rounded-b-3xl md:border-x md:border-b border-fifa-slate-200">
                        <div className="grid grid-cols-1 md:grid-cols-1 gap-8">
                          {group.teams.map((team, teamIndex) => {
                            const teamStickers = filteredGroupStickers.filter(s => s.teamCode === team.code);
                            if (teamStickers.length === 0 && filter !== 'all') return null;
                            const firstVisibleTeamIndex = group.teams.findIndex((candidate) => {
                              const candidateStickers = filteredGroupStickers.filter(s => s.teamCode === candidate.code);
                              return candidateStickers.length > 0;
                            });
                            const isFirstVisibleTeam = teamIndex === firstVisibleTeamIndex;

                            return (
                              <div
                                key={team.code}
                                className="space-y-4 scroll-mt-44 md:scroll-mt-52"
                                ref={isFirstVisibleTeam ? (node) => {
                                  groupFirstCountryRefs.current[group.name] = node;
                                } : undefined}
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

      <AnimatePresence>
        <motion.div
          initial={{ y: 80, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 80, opacity: 0 }}
          transition={{ duration: 0.25, ease: 'easeOut' }}
          className="fixed bottom-4 left-4 right-4 z-[140] md:hidden pointer-events-none"
        >
          <div className="pointer-events-auto mx-auto flex max-w-2xl items-center gap-2 rounded-2xl border border-white/10 bg-[#002772]/95 px-3 py-3 text-white shadow-2xl backdrop-blur-xl">
            <Search className="h-4 w-4 shrink-0 text-white/40" />
            <input
              type="text"
              placeholder="Busque por times, jogadores ou códigos..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="min-w-0 flex-1 bg-transparent text-xs font-bold italic text-white placeholder:text-white/35 outline-none"
            />
            {searchQuery.trim() ? (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="shrink-0 rounded-xl border border-white/10 bg-white/10 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-white hover:bg-white/20 transition-colors"
              >
                Limpar
              </button>
            ) : (
              <span className="shrink-0 rounded-xl bg-white/10 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-white/45">
                Buscar
              </span>
            )}
          </div>
        </motion.div>
      </AnimatePresence>

      {/* Floating Action Toast / Feedback */}
      <AnimatePresence>
        {showShareToast && (
          <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[220] px-4 w-full max-w-md pointer-events-none">
            <motion.div 
              initial={{ y: -20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ opacity: 0 }}
              className={`px-4 py-3 rounded-full text-xs font-bold flex items-center gap-2 shadow-2xl border justify-center text-center ${
                toastTone === 'warning'
                  ? 'bg-[#8b0000] text-white border-[#fedf00]/30 shadow-[0_20px_40px_rgba(139,0,0,0.28)]'
                  : toastTone === 'success'
                    ? 'bg-[#009b3a] text-white border-white/20'
                    : 'bg-fifa-primary text-white border-white/20'
              }`}
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

                <div className="mt-6 space-y-5">
                  <div className="flex items-center justify-between gap-3">
                    <button
                      type="button"
                      onClick={() => setTutorialSlide((prev) => (prev - 1 + tutorialSlides.length) % tutorialSlides.length)}
                      className="rounded-2xl border border-fifa-slate-200 bg-white px-4 py-2 text-xs font-black uppercase tracking-widest text-fifa-primary hover:bg-fifa-slate-50 transition-colors"
                    >
                      Anterior
                    </button>
                    <div className="flex items-center gap-2">
                      {tutorialSlides.map((slide, idx) => (
                        <button
                          key={slide.title}
                          type="button"
                          onClick={() => setTutorialSlide(idx)}
                          className={`h-2.5 rounded-full transition-all ${idx === tutorialSlide ? 'w-8 bg-fifa-primary' : 'w-2.5 bg-fifa-slate-200'}`}
                          aria-label={`Ir para o slide ${idx + 1}`}
                        />
                      ))}
                    </div>
                    <button
                      type="button"
                      onClick={handleTutorialNext}
                      className="rounded-2xl border border-fifa-slate-200 bg-white px-4 py-2 text-xs font-black uppercase tracking-widest text-fifa-primary hover:bg-fifa-slate-50 transition-colors"
                    >
                      {tutorialSlide >= tutorialSlides.length - 1 ? 'Começar agora' : 'Próximo'}
                    </button>
                  </div>

                  <motion.div
                    key={tutorialSlide}
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -12 }}
                    transition={{ duration: 0.35 }}
                    className="space-y-4"
                  >
                    {renderTutorialPreview(tutorialSlide)}
                    <div className="rounded-[1.75rem] border border-fifa-slate-100 bg-fifa-slate-50 p-5 md:p-6">
                      <p className={`text-[10px] font-black uppercase tracking-[0.3em] bg-gradient-to-r ${tutorialSlides[tutorialSlide].accent} bg-clip-text text-transparent`}>
                        {tutorialSlides[tutorialSlide].title}
                      </p>
                      <p className="mt-3 text-sm md:text-base font-semibold leading-relaxed text-fifa-primary/70">
                        {tutorialSlides[tutorialSlide].description}
                      </p>
                    </div>
                  </motion.div>

                  <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                    <p className="text-[10px] font-black uppercase tracking-[0.28em] text-fifa-primary/30">
                      Slide {tutorialSlide + 1} de {tutorialSlides.length}
                    </p>
                    <button
                      type="button"
                      onClick={dismissTutorial}
                      className="inline-flex items-center justify-center gap-2 rounded-2xl bg-fifa-primary px-5 py-3 text-sm font-black uppercase tracking-widest text-white shadow-lg shadow-fifa-primary/20 transition-transform active:scale-95"
                    >
                      Começar agora
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showWallpaperUnlock !== null && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 md:p-8">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={dismissWallpaperUnlock}
              className="absolute inset-0 bg-black/75 backdrop-blur-xl"
            />
            <motion.div
              initial={{ scale: 0.94, opacity: 0, y: 18 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.94, opacity: 0, y: 18 }}
              className="relative w-full max-w-xl overflow-hidden rounded-[2rem] border border-white/10 bg-white shadow-2xl"
            >
              <div className="h-1 w-full bg-gradient-to-r from-fifa-accent via-fifa-cyan to-fifa-peach" />
              <div className="p-6 md:p-8">
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-2">
                    <p className="text-[10px] font-black uppercase tracking-[0.3em] text-fifa-primary/35">Recompensa liberada</p>
                    <h3 className="text-2xl md:text-3xl font-black text-fifa-primary uppercase tracking-tight">
                      Wallpaper {showWallpaperUnlock + 1} desbloqueado
                    </h3>
                    <p className="text-sm md:text-base font-medium text-fifa-primary/65 max-w-xl">
                      Você atingiu a meta de desbloqueio e liberou um novo wallpaper da coleção.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={dismissWallpaperUnlock}
                    className="p-2 hover:bg-fifa-slate-100 rounded-full transition-colors"
                    aria-label="Fechar aviso de wallpaper"
                  >
                    <X className="h-6 w-6 text-fifa-primary/40" />
                  </button>
                </div>

                <div className="mt-6 grid gap-5 md:grid-cols-[180px_1fr] md:items-center">
                  <div className="rounded-[1.75rem] border border-fifa-slate-100 bg-fifa-slate-50 p-4">
                    <div className="overflow-hidden rounded-[1.35rem] bg-white shadow-sm">
                      <img
                        src={loadingImages[showWallpaperUnlock]}
                        alt="Wallpaper desbloqueado"
                        className="h-44 w-full object-cover"
                      />
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div className="rounded-[1.5rem] border border-[#009b3a]/15 bg-[#009b3a]/8 p-4">
                      <p className="text-[10px] font-black uppercase tracking-[0.25em] text-[#009b3a]">Liberado agora</p>
                      <p className="mt-2 text-sm md:text-base font-semibold leading-relaxed text-fifa-primary/75">
                        Baixe o wallpaper {showWallpaperUnlock + 1} para celebrar o avanço da coleção.
                      </p>
                    </div>

                    <div className="flex flex-col md:flex-row gap-3 md:justify-end">
                      <button
                        type="button"
                        onClick={dismissWallpaperUnlock}
                        className="rounded-2xl border border-fifa-slate-200 px-5 py-3 text-sm font-black uppercase tracking-widest text-fifa-primary hover:bg-fifa-slate-50 transition-colors"
                      >
                        Depois
                      </button>
                      <button
                        type="button"
                        onClick={() => openWallpaperDownload(showWallpaperUnlock)}
                        className="rounded-2xl bg-fifa-primary px-5 py-3 text-sm font-black uppercase tracking-widest text-white shadow-lg shadow-fifa-primary/20 transition-transform active:scale-95"
                      >
                        Baixar wallpaper
                      </button>
                    </div>
                  </div>
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
                {buildTradeEntries(exportPreview.type).grouped.map(({ key, teamCode, teamName, flag, labels }) => (
                  <div key={key} className="flex gap-4 border-b border-fifa-slate-100 pb-4">
                    <div className="w-44 flex items-center gap-3">
                      {flag ? (
                        <img
                          src={`https://flagcdn.com/w80/${flag}.png`}
                          alt={teamName}
                          className="w-9 h-auto rounded shadow-sm border border-fifa-slate-100"
                        />
                      ) : (
                        <div className="w-9 h-7 rounded bg-fifa-slate-100 flex items-center justify-center text-[9px] font-black text-fifa-primary/40">
                          {teamCode}
                        </div>
                      )}
                      <div className="min-w-0">
                        <p className="text-sm font-black text-fifa-primary italic uppercase leading-tight truncate">{teamName}</p>
                        <p className="text-[10px] font-bold text-fifa-primary/35 uppercase tracking-[0.2em]">{teamCode}</p>
                      </div>
                    </div>
                    <span className="flex-1 text-sm font-bold text-fifa-primary/60">{labels.join(", ")}</span>
                  </div>
                ))}
              </div>

              <div className="p-6 md:p-8 border-t border-fifa-slate-100 bg-white">
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => copyTradeList(exportPreview.type)}
                    className="w-full py-4 bg-fifa-slate-50 text-fifa-primary rounded-2xl font-black uppercase italic tracking-widest shadow-xl hover:scale-[1.01] active:scale-95 transition-all flex items-center justify-center gap-3 border border-fifa-slate-100"
                  >
                    <Copy className="h-5 w-5" />
                    Copiar lista
                  </button>
                  <button 
                    onClick={() => {
                      shareList(exportPreview.type);
                      setExportPreview(null);
                    }}
                    className="w-full py-4 bg-fifa-accent text-fifa-primary rounded-2xl font-black uppercase italic tracking-widest shadow-xl hover:scale-[1.02] active:scale-95 transition-all flex items-center justify-center gap-3"
                  >
                    <Trophy className="h-5 w-5" />
                    Download
                  </button>
                  <button
                    type="button"
                    onClick={() => openTradeListWhatsApp(exportPreview.type)}
                    className="w-full py-4 bg-[#25D366] text-white rounded-2xl font-black uppercase italic tracking-widest shadow-xl hover:scale-[1.01] active:scale-95 transition-all flex items-center justify-center gap-3 col-span-2"
                  >
                    <MessageCircleMore className="h-5 w-5" />
                    WhatsApp
                  </button>
                </div>
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
                  <div className="grid grid-cols-2 gap-3">
                    <button 
                      onClick={exportMarkdownData}
                      className="flex flex-col items-center justify-center gap-3 py-6 bg-fifa-slate-50 border-2 border-fifa-slate-100 rounded-2xl hover:border-fifa-primary transition-all group"
                    >
                      <div className="p-3 bg-white rounded-xl shadow-sm group-hover:bg-fifa-primary group-hover:text-white transition-colors">
                        <Share2 className="h-5 w-5" />
                      </div>
                      <span className="text-[10px] font-black uppercase tracking-widest">Backup</span>
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
                  <div className="mt-3 rounded-2xl border border-[#8b0000]/15 bg-[#8b0000]/6 p-4 text-[#8b0000] shadow-sm">
                    <div className="flex items-start gap-3">
                      <div className="mt-0.5 flex h-6 w-6 items-center justify-center rounded-full bg-[#8b0000] text-white text-[10px] font-black">!</div>
                      <p className="text-[10px] md:text-xs font-black leading-relaxed uppercase tracking-[0.14em]">
                        Se for limpar a memória cache do navegador, faça um backup antes para não perder a coleção.
                      </p>
                    </div>
                  </div>
                </div>

                <div>
                  <h4 className="text-[10px] font-black uppercase text-fifa-primary/40 tracking-[0.2em] mb-4">Wallpapers</h4>
                  <div className="grid grid-cols-3 gap-3">
                    {loadingImages.map((url, index) => (
                      (() => {
                        const thresholds = [1, 0.25, 0.5];
                        const required = thresholds[index] ?? 1;
                        const progress = officialStats.total > 0 ? officialStats.collected / officialStats.total : 0;
                        const unlocked = index === 0 ? officialStats.collected >= 1 : progress >= required;
                        const requiredLabel = index === 0 ? '1 figura' : `${Math.round(required * 100)}%`;
                        const tooltipText = index === 0
                          ? 'Conquiste ao cadastrar a primeira figurinha.'
                          : index === 1
                            ? 'Conquiste ao atingir 25% da coleção.'
                            : 'Conquiste ao atingir 50% da coleção.';
                        const label = unlocked ? `Baixar ${index + 1}` : `Bloqueado ${index + 1}`;

                        return (
                      <div key={url} className="relative group">
                        <button
                          type="button"
                          onClick={() => {
                            if (!unlocked) {
                              showWallpaperTooltip(index);
                              return;
                            }
                            handleWallpaperAction(url, index);
                          }}
                          aria-disabled={!unlocked}
                          className={`relative flex w-full flex-col items-center justify-center gap-2 rounded-2xl border-2 py-4 transition-all ${
                            unlocked
                              ? 'border-fifa-slate-100 bg-fifa-slate-50 hover:border-fifa-primary'
                              : 'border-fifa-slate-100 bg-fifa-slate-50/70 opacity-60 grayscale cursor-not-allowed'
                          }`}
                        >
                          <div className="h-12 w-12 overflow-hidden rounded-xl bg-white shadow-sm">
                            {unlocked ? (
                              <img
                                src={url}
                                alt={`Wallpaper ${index + 1}`}
                                className="h-full w-full object-cover"
                              />
                            ) : (
                              <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-fifa-slate-100 to-fifa-slate-200 text-[#8b0000]">
                                <Lock className="h-5 w-5" />
                              </div>
                            )}
                          </div>
                          <span className="text-[10px] font-black uppercase tracking-widest">{label}</span>
                          {!unlocked && (
                            <span className="absolute right-2 top-2 rounded-full bg-[#8b0000] px-2 py-0.5 text-[8px] font-black uppercase tracking-[0.25em] text-white shadow-lg">
                              {requiredLabel}
                            </span>
                          )}
                        </button>
                        {!unlocked && (
                          <>
                            <div className="pointer-events-none absolute left-1/2 bottom-full z-20 mb-2 hidden w-40 -translate-x-1/2 opacity-0 transition-opacity duration-200 group-hover:opacity-100 group-focus-within:opacity-100 md:block">
                              <div className="rounded-2xl border border-[#8b0000]/20 bg-[#8b0000] px-3 py-2 text-center text-[10px] font-black uppercase tracking-[0.18em] text-white shadow-2xl">
                                {tooltipText}
                              </div>
                              <div className="mx-auto -mb-1 h-3 w-3 rotate-45 bg-[#8b0000] border-r border-b border-[#8b0000]/20" />
                            </div>
                            <div className={`pointer-events-none absolute left-1/2 bottom-full z-20 mb-2 w-44 -translate-x-1/2 transition-all duration-200 md:hidden ${
                              activeWallpaperTooltip === index ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-1'
                            }`}>
                              <div className="rounded-2xl border border-[#8b0000]/20 bg-[#8b0000] px-3 py-2 text-center text-[10px] font-black uppercase tracking-[0.18em] text-white shadow-2xl">
                                {tooltipText}
                              </div>
                              <div className="mx-auto -mb-1 h-3 w-3 rotate-45 bg-[#8b0000] border-r border-b border-[#8b0000]/20" />
                            </div>
                          </>
                        )}
                      </div>
                        );
                      })()
                    ))}
                  </div>
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
                    <h3 className="mt-2 text-xl md:text-2xl font-black text-fifa-primary uppercase tracking-tight">Cole o texto do backup</h3>
                    <p className="mt-2 text-sm text-fifa-primary/55">
                      Você pode colar o backup ou TXT exportado. Se for limpar a memória cache do navegador, faça um backup antes.
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
                      <p className="text-[10px] font-black uppercase tracking-[0.2em] text-fifa-primary/35">Códigos únicos</p>
                      <p className="mt-1 text-2xl font-black text-fifa-primary">{importedDistinctCount}</p>
                    </div>
                    <div className="rounded-2xl border border-fifa-slate-100 bg-fifa-slate-50 px-4 py-3">
                      <p className="text-[10px] font-black uppercase tracking-[0.2em] text-fifa-primary/35">Figurinhas no backup</p>
                      <p className="mt-1 text-2xl font-black text-fifa-primary">{importedTotalCount}</p>
                    </div>
                    <div className="rounded-2xl border border-fifa-slate-100 bg-fifa-slate-50 px-4 py-3">
                      <p className="text-[10px] font-black uppercase tracking-[0.2em] text-fifa-primary/35">Contam para o álbum</p>
                      <p className="mt-1 text-sm font-black text-fifa-primary uppercase">
                        {importedPreview ? importedOfficialCount : 'Aguardando texto válido'}
                      </p>
                    </div>
                  </div>

                  {importedPreview && (
                    <div className="rounded-2xl border border-fifa-slate-100 bg-white px-4 py-3 text-sm text-fifa-primary/60">
                      <span className="font-black uppercase tracking-[0.2em] text-fifa-primary/35">Fora da meta: </span>
                      <span className="font-bold">{importedNonOfficialCount} figurinhas extras ou Coca-Cola.</span>
                    </div>
                  )}

                  {importText.trim() && !importedPreview && (
                    <p className="text-sm font-bold text-red-600">
                      Não reconheci esse texto. Cole um backup ou TXT exportado pelo app.
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
      <AnimatePresence>
        {showCompletionCelebration && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[230] flex items-center justify-center p-4 md:p-8"
          >
            <div className="absolute inset-0 bg-black/75 backdrop-blur-md" />
            <motion.div
              initial={{ scale: 0.92, y: 24, opacity: 0 }}
              animate={{ scale: 1, y: 0, opacity: 1 }}
              exit={{ scale: 0.92, y: 24, opacity: 0 }}
              className="relative w-full max-w-lg overflow-hidden rounded-[2rem] bg-white shadow-2xl"
            >
              <div className="h-2 w-full bg-gradient-to-r from-[#009b3a] via-[#fedf00] to-[#002772]" />
              <div className="relative p-8 md:p-10 text-center">
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(0,151,57,0.10),transparent_40%)]" />
                <div className="relative flex flex-col items-center gap-6">
                  <img
                    src="https://upload.wikimedia.org/wikipedia/en/1/17/2026_FIFA_World_Cup_emblem.svg"
                    alt="Logo da Copa 2026"
                    className="h-24 md:h-28 w-auto drop-shadow-[0_0_25px_rgba(0,39,114,0.18)]"
                  />
                  <div className="space-y-2">
                    <p className="text-[10px] font-black uppercase tracking-[0.45em] text-fifa-primary/35">Parabéns</p>
                    <h3 className="text-3xl md:text-4xl font-black uppercase italic tracking-tight text-fifa-primary">
                      Álbum completo
                    </h3>
                    <p className="text-sm md:text-base font-semibold text-fifa-primary/60 max-w-md mx-auto">
                      Você completou as 980 figurinhas oficiais da coleção Stickers Copa 26.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowCompletionCelebration(false)}
                    className="mt-2 rounded-2xl bg-fifa-primary px-5 py-3 text-sm font-black uppercase tracking-widest text-white shadow-lg shadow-fifa-primary/20 transition-transform active:scale-95"
                  >
                    Continuar
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      <footer className="px-4 py-6 text-center text-[10px] font-bold uppercase tracking-[0.25em] text-fifa-primary/35">
        Criado por:
        <a
          href="https://github.com/sidneirocha"
          target="_blank"
          rel="noreferrer"
          className="text-fifa-primary/60 hover:text-fifa-primary underline underline-offset-4 normal-case tracking-normal"
        >
          github.com/sidneirocha
        </a>
      </footer>
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
            <div className={`absolute bottom-0 left-0 w-full p-1 text-center transition-colors duration-500 ${isCollected ? 'bg-black/60' : 'bg-fifa-slate-200/80'}`}>
              <span className={`text-[8px] md:text-[9px] font-black uppercase truncate block leading-none ${isCollected ? 'text-white' : 'text-fifa-primary/40'}`}>
                {sticker.teamName}
              </span>
            </div>

            {/* Variant/Number Tag */}
            <div className="absolute top-0 right-0 p-1">
               <span className={`text-[7px] md:text-[8px] font-black uppercase italic px-1.5 rounded truncate block leading-none transition-all duration-500
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

            <div className="text-[7px] md:text-[8px] font-black uppercase opacity-60 italic tracking-widest mb-auto pt-1">
              FIFA EXTRA
            </div>

            <div className="flex-1 flex flex-col items-center justify-center -mt-1">
              <span className={`text-2xl md:text-3xl font-black italic tracking-tighter leading-none drop-shadow-sm`}>
                {getInitials(sticker.teamName)}
              </span>
              <div className={`h-0.5 w-4 mt-1 rounded-full ${isCollected ? 'bg-current opacity-40' : 'bg-fifa-primary/10'}`} />
            </div>

            <div className="mt-auto w-full flex flex-col items-center pb-1 gap-1">
              <div className={`text-[7px] md:text-[8px] font-black uppercase px-2 py-0.5 rounded-full border ${isCollected ? 'border-current/20 bg-current/10' : 'border-fifa-primary/5'}`}>
                {sticker.number}
              </div>
            </div>
          </div>
        ) : (
          <>
            <span className="text-[8px] md:text-[8px] font-black uppercase opacity-70 leading-none">{sticker.teamCode}</span>
            <span className="text-sm md:text-sm font-black leading-none mt-1">{sticker.number}</span>
            {sticker.teamCode === 'EXTRA' && (
               <span className="text-[8px] md:text-[7px] font-black uppercase mt-1 px-1 text-center line-clamp-2 leading-none">
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
  completed?: boolean;
  alignLeft?: boolean;
  children: ReactNode;
  isOpen: boolean;
  onToggle: () => void;
}> = ({ title, subtitle, flags, duplicates, completed, alignLeft, children, isOpen, onToggle }) => {
  const hasFlags = Boolean(flags && flags.length > 0);
  return (
    <div className="overflow-hidden">
      <button
        onClick={onToggle}
        className={`
          w-full flex items-center justify-between py-3 px-4 md:px-5 bg-white border border-fifa-slate-200 transition-all shadow-sm
          ${isOpen ? 'rounded-t-2xl md:rounded-t-3xl border-b-0' : 'rounded-2xl md:rounded-3xl hover:border-fifa-accent'}
        `}
      >
        {hasFlags ? (
          <div className="flex w-full items-center gap-3 md:gap-4">
            <div className={`min-w-0 flex-1 ${alignLeft ? 'text-left' : 'text-left'}`}>
              <div className="flex items-baseline gap-2 flex-wrap">
                <span className="text-xs md:text-sm font-black text-fifa-primary uppercase tracking-tight italic">{title}</span>
                {subtitle && <span className="text-[9px] md:text-[10px] font-black text-fifa-primary/30 leading-none uppercase tracking-widest whitespace-nowrap">{subtitle}</span>}
                <div className="flex items-center gap-2 shrink-0">
                  {completed && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-green-50 text-green-700 px-2 py-0.5 text-[8px] md:text-[9px] font-black uppercase italic border border-green-200">
                      <CheckCircle2 className="h-3 w-3 md:h-3.5 md:w-3.5" />
                      Completo
                    </span>
                  )}
                  {duplicates !== undefined && duplicates > 0 && (
                    <span className="text-[8px] md:text-[9px] font-black bg-fifa-peach text-white px-1.5 md:px-2 py-0.5 rounded-full uppercase italic shrink-0">
                      +{duplicates}
                    </span>
                  )}
                </div>
              </div>
            </div>
              <div className="flex flex-1 items-center justify-center gap-2 md:gap-3 px-1">
              {flags.map((flag, idx) => (
                <img 
                  key={idx}
                  src={`https://flagcdn.com/w80/${flag || 'un'}.png`}
                  className="w-10 md:w-12 h-6 md:h-7 object-cover rounded-md shadow-sm border border-fifa-slate-100"
                  alt=""
                />
              ))}
            </div>
            <div className={`p-1.5 md:p-2 rounded-full transition-transform duration-300 shrink-0 ${isOpen ? 'bg-fifa-primary rotate-180 shadow-md' : 'bg-fifa-slate-50'}`}>
              <ChevronDown className={`h-4 md:h-5 w-4 md:h-5 ${isOpen ? 'text-white' : 'text-fifa-primary/30'}`} />
            </div>
          </div>
        ) : (
          <>
            <div className="flex flex-col items-start gap-2 md:gap-3 flex-1">
              <div className={`flex items-center gap-2 w-full pr-2 md:pr-4 ${alignLeft ? 'justify-start' : 'justify-between'}`}>
                <div className={`flex items-baseline gap-2 ${alignLeft ? 'text-left' : ''}`}>
                  <span className="text-xs md:text-sm font-black text-fifa-primary uppercase tracking-tight italic">{title}</span>
                  {subtitle && <span className="text-[9px] md:text-[10px] font-black text-fifa-primary/30 leading-none uppercase tracking-widest whitespace-nowrap">{subtitle}</span>}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {completed && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-green-50 text-green-700 px-2 py-0.5 text-[8px] md:text-[9px] font-black uppercase italic border border-green-200">
                      <CheckCircle2 className="h-3 w-3 md:h-3.5 md:w-3.5" />
                      Completo
                    </span>
                  )}
                  {duplicates !== undefined && duplicates > 0 && (
                    <span className="text-[8px] md:text-[9px] font-black bg-fifa-peach text-white px-1.5 md:px-2 py-0.5 rounded-full uppercase italic shrink-0">
                      +{duplicates}
                    </span>
                  )}
                </div>
              </div>
            </div>
            <div className={`p-1 rounded-full transition-transform duration-300 shrink-0 ${isOpen ? 'bg-fifa-primary rotate-180 shadow-md' : 'bg-fifa-slate-50'}`}>
              <ChevronDown className={`h-4 md:h-5 w-4 md:h-5 ${isOpen ? 'text-white' : 'text-fifa-primary/30'}`} />
            </div>
          </>
        )}
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
