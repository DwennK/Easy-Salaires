# Assets embarqués

Ressources locales ; aucun chargement externe à l’exécution. Vérification le 8 octobre 2026. Les fichiers AFC sont les originaux, sans redessin.

| Ressource | Provenance et utilisation |
| --- | --- |
| `public/templates/form-11-dfe.pdf` | [AFC, formulaire 11 officiel français/allemand/anglais](https://www.estv.admin.ch/dam/fr/sd-web/ZHHPweebOHYN/dbst-form-11lohna-rechts-dfe-fr.pdf). AcroForm original prérempli localement, champs restant éditables. |
| `public/templates/guide-2026-fr.pdf` | [AFC, guide 2026](https://www.estv.admin.ch/dam/fr/sd-web/afP1GDFr8gE3/dbst-form-lohna-wegleitung-2026-fr.pdf). Document officiel embarqué pour la saisie complémentaire. |
| `public/fonts/NotoSans-Regular.ttf` | [Noto Sans](https://github.com/notofonts/latin-greek-cyrillic), SIL Open Font License 1.1, licence adjacente `OFL.txt`. Police des documents PDF, accents et texte sélectionnable. |
| Inter | `@fontsource/inter`, SIL Open Font License 1.1, [projet Inter](https://github.com/rsms/inter). Sous-ensembles latins 400/500/600/700 embarqués par Vite. Licence dans le paquet. |
| Icônes d’interface | `lucide-vue-next`, licence ISC, [Lucide](https://lucide.dev/license). SVG rendus localement. |
| `src/assets/wordmark.webp` | Lettrage original « Easy Salaire », généré avec ImageGen le 19 novembre 2026. |
| `src/assets/app-icon.png` et `src/assets/payslip.webp` | Mascotte originale générée avec ImageGen le 19 novembre 2026, déclinée pour l’interface et les icônes de plateforme dans `src-tauri/icons/` avec Tauri CLI. |

La palette et la navigation s’inspirent de [Handy](https://github.com/cjpais/Handy).

Prompts ImageGen du 19 novembre 2026

**Lettrage**

> Logo-brand. Create an original illustrated typographic wordmark for the Swiss payroll desktop application. The ONLY text must say exactly “Easy Salaire” (singular). Arrange in two tightly interlocked stacked lines 'Easy' on top and 'Salaire' below as a single wide compact silhouette. 1970s friendly hand-lettered soft, heavy, slightly forward-leaning rounded bubble lettering with a lively baseline. Solid bubblegum pink #FAA2CA letters, thick even deep plum #382731 ink outlines, subtle offset chunky plum ink extrusion. Beautiful recognizable letter shapes and legibility when scaled to 140px wide. Transparent background, cropped visually around the centered lettering, no surrounding container, no badge, no mascot, no extra pictogram, no gradients, no glow, no scenery. Professional screen-printed typographic signature.

**Mascotte**

> Logo-brand. An original die-cut mascot mark for Easy Salaire, Swiss payroll desktop app. A single cheerful upright pink payslip with a folded upper-right corner, short scalloped receipt bottom edge, two short plum bookkeeping lines on its forehead, tiny happy ink eyes and smile, simple little bent arms with mitten hands and chunky little feet. Slight jaunty three-quarter tilt, one hand giving a thumbs up. Classic 1970s rubber-hose cartoon spot illustration, iconic and extremely simple silhouette. Flat opaque bubblegum pink #FAA2CA with a substantial smooth very dark plum #382731 outline, a small cream highlight in the fold. Crisp, flat vector-like fills, transparent background outside the character, no type, no words, no lettering, no coin, no square app tile, no texture, no shadow, no gradients. One large centered character, generous clear edge, square composition. Readable at app-icon size.

SHA-256 des ressources conservées :

```text
46a895f5392100fc90ff89024c86dce333259f6e2d3d81881e2d26721f98ad32  public/templates/form-11-dfe.pdf
d926cfebf29ed3410b6e9f89b5db4f063ebe0686b228d22c73cd9fd644a51902  public/templates/guide-2026-fr.pdf
b85c38ecea8a7cfb39c24e395a4007474fa5a4fc864f6ee33309eb4948d232d5  public/fonts/NotoSans-Regular.ttf
f93e6d2575e76e51b240f066a45793ef0ca3d7e0543f2d986f36f1fb146494a7  src/assets/app-icon.png
```

Le guide et le formulaire AFC conservent leur présentation et leur langue officielles. Les textes produits par l’application sont FR/EN ; les données saisies par l’utilisateur restent inchangées.
