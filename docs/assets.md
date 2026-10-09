# Assets embarqués

Ressources locales ; aucun chargement externe à l’exécution. Vérification le 8 octobre 2026. Les fichiers AFC sont les originaux, sans redessin.

| Ressource | Provenance et utilisation |
| --- | --- |
| `public/templates/form-11-dfe.pdf` | [AFC, formulaire 11 officiel français/allemand/anglais](https://www.estv.admin.ch/dam/fr/sd-web/ZHHPweebOHYN/dbst-form-11lohna-rechts-dfe-fr.pdf). AcroForm original prérempli localement, champs restant éditables. |
| `public/templates/guide-2026-fr.pdf` | [AFC, guide 2026](https://www.estv.admin.ch/dam/fr/sd-web/afP1GDFr8gE3/dbst-form-lohna-wegleitung-2026-fr.pdf). Document officiel embarqué pour la saisie complémentaire. |
| `public/fonts/NotoSans-Regular.ttf` | [Noto Sans](https://github.com/notofonts/latin-greek-cyrillic), SIL Open Font License 1.1, licence adjacente `OFL.txt`. Police des documents PDF, accents et texte sélectionnable. |
| Inter | `@fontsource/inter`, SIL Open Font License 1.1, [projet Inter](https://github.com/rsms/inter). Sous-ensembles latins 400/500/600/700 embarqués par Vite. Licence dans le paquet. |
| Icônes d’interface | `lucide-vue-next`, licence ISC, [Lucide](https://lucide.dev/license). SVG rendus localement. |
| `src/assets/app-icon.png` | Création originale ImageGen, 8 octobre 2026. Déclinaisons desktop générées dans `src-tauri/icons/` avec Tauri CLI. Aucun service d’image utilisé par l’application. |

Prompt utilisé pour l’icône :

> Use case: logo-brand. Create a single original desktop app icon for Easy Salaires, a Swiss offline payroll app. Square 1024x1024. Flat deep forest green background with a restrained warm ivory abstract folded salary slip symbol, three aligned horizontal lines and a small precise check integrated in the bottom right. Professional Swiss modernist geometry, balanced negative space, perfectly crisp edges, no text, no letters, no gradients, no shadows, no scene, no mockup, no border, full bleed square. This is a production app icon.

SHA-256 des ressources conservées :

```text
46a895f5392100fc90ff89024c86dce333259f6e2d3d81881e2d26721f98ad32  public/templates/form-11-dfe.pdf
d926cfebf29ed3410b6e9f89b5db4f063ebe0686b228d22c73cd9fd644a51902  public/templates/guide-2026-fr.pdf
b85c38ecea8a7cfb39c24e395a4007474fa5a4fc864f6ee33309eb4948d232d5  public/fonts/NotoSans-Regular.ttf
3c4ec8f54a5b8ed975db937a420029e085421df2ee3d44dc56500c691363fb52  src/assets/app-icon.png
```

Le guide et le formulaire AFC conservent leur présentation et leur langue officielles. Les textes produits par l’application sont FR/EN ; les données saisies par l’utilisateur restent inchangées.
