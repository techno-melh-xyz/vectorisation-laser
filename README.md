# Vectorisation Laser V10 — Trois modes et éditeur de courbes

Application Web en français, hébergeable gratuitement sur GitHub Pages.

## Les trois modes

1. **Contours fermés — Découpe** : recherche l'intérieur des motifs fermés et génère un chemin fermé pour chaque forme. Si aucune surface intérieure n'est trouvée, le programme utilise la silhouette extérieure de l'encre et affiche un avertissement.
2. **Deux bords du trait — Vectorisation classique** : extrait les contours extérieurs et intérieurs des bandes d'encre noire. Un trait épais fermé produit typiquement **deux chemins fermés** (les deux côtés du trait), contrairement au mode découpe. Ne pas confondre les deux chemins avec un tracé de découpe unique.
3. **Ligne centrale — Gravure** : amincit les traits noirs et suit leur ligne médiane. Les chemins peuvent rester ouverts.

Les trois tracés sont calculés dans le navigateur par `web/trace-modes.js`. Le moteur Rust/VTracer est conservé dans le projet, mais **ces trois modes emploient leurs algorithmes JavaScript spécialisés**. KizamuBeam a inspiré les fonctionnalités, sans reprise de son code source.

## Édition des courbes de Bézier

1. Importer la photographie, recadrer et cliquer sur **Vectoriser**.
2. Ouvrir **Agrandir / Zoom** dans le panneau **Résultat vectorisé**.
3. Cocher **Éditer les courbes**.
4. Cliquer sur un chemin SVG. Les **points bleus** apparaissent, et les **poignées vertes** sont visibles pour un nœud de Bézier sélectionné.
5. Choisir **Lisser le tracé** : conversion des portions douces en courbes cubiques `C`, tout en préservant les pointes et angles prononcés. **Réduire les points + lisser** simplifie également la géométrie. Le curseur **Lissage** ajuste l'intensité.
6. Déplacer les points à la souris ; cliquer sur un point puis utiliser **Lisser ce point**, **Point d'angle** ou **Supprimer le point**. Déplacer les poignées vertes pour ajuster les tangentes ; désactiver **Poignées symétriques** si les poignées doivent être indépendantes.
7. Cliquer sur **Télécharger le SVG modifié** dans la fenêtre d'édition. Les modifications sont également prises en compte par le bouton de téléchargement principal.

Fonctions supplémentaires : **Annuler** (Ctrl+Z dans la fenêtre), **Rétablir l'origine**, zoom à la molette, boutons ±, ajustement automatique, déplacement en faisant glisser le fond et fermeture par Échap. Pour limiter l'encombrement, au-delà de 220 points seuls certains marqueurs sont affichés. L'action **Réduire les points + lisser** est alors utile.

La modification n'est pas sauvegardée dans un projet distinct : elle est enregistrée dans le SVG téléchargé. Un nouveau clic sur **Vectoriser** recrée les chemins et remplace l'édition précédente.

## Déploiement GitHub Pages

1. Décompresser le ZIP et transférer les dossiers à la racine d'un dépôt GitHub (conserver le dossier caché `.github`).
2. Dans GitHub → Settings → Pages, choisir **GitHub Actions**.
3. La compilation est gérée par `.github/workflows/pages.yml`. L'application est déployée après validation sur `main`.
4. Rafraîchir le navigateur avec `Ctrl+F5`, et vérifier **V10** dans le titre.

**Fichiers importants** : `web/app.js`, `web/trace-modes.js`, `web/bezier-model.js`, `web/curve-editor.js`, `web/index.html`, `web/style.css`, `src/lib.rs`.

La correction de typage Rust `cfg.path_precision = Some(2);` est incluse.

## Vérification locale

```bash
node --test tests/*.test.mjs
```

## Prudence avant la découpe

Les fichiers SVG produits ont des coordonnées en **pixels source**, sans dimension réelle en millimètres. Régler l'échelle physique dans xTool Studio / LightBurn avant toute opération. Vérifier la fermeture des contours, les passages doubles, la présence de petits chemins parasites et les intersections. L'édition manuelle peut créer des auto-intersections ou rendre un tracé impropre à la découpe. Les images restent locales dans le navigateur.
