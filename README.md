# Stickers Copa 26

Gerenciador visual de figurinhas da Copa 2026, pensado para acompanhar a coleção no celular e no desktop com foco em rapidez, organização e exportação.

## Loading

O app abre com uma tela de impacto visual antes de liberar o painel principal. Esse loading alterna imagens temáticas da Copa e cria a sensação de abertura da coleção.

| Imagem 1 | Imagem 2 | Imagem 3 |
| --- | --- | --- |
| ![Loading 1](https://raw.githubusercontent.com/sidneirocha/stickerscopa26/99fab2db99f5941e3a573be4c30def3eedbb17d8/wp1.webp) | ![Loading 2](https://raw.githubusercontent.com/sidneirocha/stickerscopa26/99fab2db99f5941e3a573be4c30def3eedbb17d8/wp2.webp) | ![Loading 3](https://raw.githubusercontent.com/sidneirocha/stickerscopa26/99fab2db99f5941e3a573be4c30def3eedbb17d8/wp3.webp) |

## Como o sistema funciona

O app foi desenhado como um painel único de controle da coleção:

1. A coleção é salva localmente no navegador com `localStorage`.
2. O usuário adiciona e remove figurinhas por cartão.
3. A busca localiza seleções por código, nome da seleção ou jogador.
4. Os filtros separam figurinhas coletadas, faltantes e repetidas.
5. O sistema calcula estatísticas em tempo real.
6. A exportação gera arquivo JSON para backup e restauração.
7. A exportação em PDF cria listas de faltantes e repetidas para troca.

## Recursos principais

- Painel mobile-first com visual inspirado na Copa.
- Organizador de seleções por grupos.
- Seção especial para cromos e extras.
- Área de lendas com variantes visuais.
- Exportação e importação de coleção.
- Geração de PDF com apoio para trocas.
- Estado persistente no navegador.

## Estrutura do app

- `src/App.tsx`: interface principal e regras de interação.
- `src/constants.ts`: grupos, seleções e dados de apoio.
- `src/types.ts`: tipos da coleção.
- `src/index.css`: base visual e variáveis do tema.
- `public/manifest.json`: comportamento de instalação como app.

## Tecnologias

- React 19
- Vite
- TypeScript
- Tailwind CSS 4
- jsPDF
- Motion
- canvas-confetti

## Rodando localmente

1. Instale as dependências:
   ```bash
   npm install
   ```
2. Rode o projeto:
   ```bash
   npm run dev
   ```

## Observação

Se você estiver vendo apenas a branch `gh-pages`, ela contém o build publicado do site. O código-fonte e este README vivem na `main`.
