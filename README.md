# Vectorisation Laser — VTracer Rust / WebAssembly

Application Web statique en français : conversion locale de dessins bitmap en SVG pour préparer la découpe laser.

## Mise en ligne sur GitHub Pages

1. Créer un dépôt **public** GitHub, par exemple `vectorisation-laser`.
2. Envoyer **tous les fichiers**, y compris `.github/workflows/pages.yml`, à la racine de la branche `main`.
3. Ouvrir **Settings → Pages → Build and deployment → Source → GitHub Actions**.
4. Dans **Actions**, lancer **Publier Vectorisation Laser** si nécessaire (`Run workflow`).
5. Attendre le succès de la compilation et du déploiement. Le site sera à `https://UTILISATEUR.github.io/vectorisation-laser/` si le dépôt porte ce nom.

Si la compilation échoue, ouvrir le journal GitHub Actions. Le code Rust/WASM n’a pas été recompilé ici ; l’interface V8 a été testée en navigateur avec un moteur SVG simulé.

## Développement local

Installer Rust, la cible `wasm32-unknown-unknown`, `wasm-pack` et un serveur HTTP local :

```bash
rustup target add wasm32-unknown-unknown
cargo install wasm-pack --locked
wasm-pack build --target web --release --out-dir web/pkg
python -m http.server 8000 --directory web
```

Ouvrir `http://localhost:8000`. Ne pas ouvrir `web/index.html` en `file://` : les modules WASM nécessitent un serveur HTTP.

## Fonctionnement

- Import PNG/JPEG/WebP, limité à 2400 pixels sur le côté le plus long pour limiter la mémoire.
- Prétraitement noir/blanc par seuil et contraste dans le navigateur.
- Vectorisation par `vtracer` 1.0.0-alpha.4 en WebAssembly.
- Simplification des courbes, aperçu SVG et export.
- Aucune image envoyée à un serveur.

**Attention :** la vectorisation suit des surfaces noires et peut produire un contour de chaque côté d'un trait. Le résultat n'est pas automatiquement un tracé central ni un fichier de découpe prêt à produire. Vérifier les chemins, les dimensions réelles, les contours fermés et les doublons dans le logiciel laser.

## Licence

Code de cette application : MIT. Moteur VTracer : MIT OR Apache-2.0, voir https://github.com/visioncortex/vtracer .


## Correction du traitement des photographies

Le mode « Nettoyage automatique du fond » est activé par défaut. Il compare chaque pixel à la luminosité moyenne de son voisinage (image intégrale), pour supprimer les ombres du papier avant le passage à VTracer. L’aperçu « Image nettoyée » permet de vérifier la détection des traits. Le seuil règle la sensibilité en mode adaptatif ; le mode classique reste disponible en décochant la case. Le moteur Rust et le workflow GitHub Actions restent inchangés. Les traits peuvent devenir des contours doubles : vérifiez le SVG avant découpe.


## V6
- Curseurs initialisés à seuil 128, contraste 100 %, simplification 0,50.
- Commandes de sélection/recadrage placées directement sous l’image d’origine.
- Version V6 visible dans l’en-tête ; fichiers CSS/JS avec `?v=6` pour contourner l’ancien cache.


## V7 — amélioration du nettoyage et de la vectorisation
- Suppression des petites taches (composantes connexes) et des régions noires touchant le bord.
- VTracer configuré en noir et blanc (`Preset::Bw`).
- Le recadrage manuel reste disponible sous l’image d’origine.

## V8 — aperçu SVG ajusté et fenêtre agrandie
- L’aperçu « Résultat vectorisé » prend toute la largeur disponible, quelle que soit la taille intrinsèque du SVG.
- Le cadrage s’appuie sur la boîte englobante des chemins (`getBBox`) avec une marge de sécurité.
- Bouton « Agrandir / Zoom » au-dessus du résultat vectorisé.
- Fenêtre agrandie : boutons `+` / `−`, zoom à la molette, déplacement par glisser-déposer, retour à « Ajuster à la fenêtre », touche Échap pour fermer.
- La fonction de recadrage, les valeurs par défaut et le moteur VTracer V7 restent inchangés.
- **Important :** la mise à l’échelle de l’aperçu n’altère pas le SVG téléchargé. Vérifier les dimensions physiques et l’échelle dans xTool Studio / LightBurn avant découpe.

Pour mettre à jour une V7 déjà déployée, remplacer seulement `web/index.html`, `web/style.css` et `web/app.js`. Aucun nouveau workflow ni aucune recompilation Rust ne sont nécessaires en principe ; votre workflow GitHub Actions peut néanmoins recompiler le projet automatiquement.

## V9 — Deux modes laser

- **Contours fermés / Découpe :** recherche d’abord les zones blanches entièrement encerclées par les traits noirs (contour interne de la forme dessinée), puis génère exclusivement des chemins SVG avec `Z`. Si aucun intérieur fermé n’est reconnu, utilise le bord extérieur de chaque surface noire avec avertissement visible (possible double découpe). Vérifier systématiquement le SVG et la géométrie réelle avant découpe.
- **Ligne centrale / Gravure :** squelettisation Zhang–Suen du dessin nettoyé, traçage du graphe en chemins SVG simples, ouverts ou bouclés. Pas de contour double autour des traits épais. Les jonctions peuvent générer plusieurs segments.
- Les deux modes disposent du même recadrage, du même nettoyage adaptatif, de la simplification, de l’aperçu avec zoom V8 et de l’export SVG. Les algorithmes géométriques dédiés sont actuellement implémentés en JavaScript local dans `web/trace-modes.js`; le projet Rust / WASM original reste présent. Aucun code copié de KizamuBeam.
- Le curseur simplification contrôle la tolérance Douglas–Peucker, en pixels image. Les coordonnées SVG sont en pixels image, et non en millimètres. Régler les dimensions de découpe dans xTool Studio ou LightBurn.

Pour mettre à jour la V8, remplacer `web/app.js`, `web/index.html`, `web/style.css` et **ajouter** `web/trace-modes.js` dans le dépôt. Le code Rust et le workflow ne changent pas.

Vérifier les algorithmes sans compilateur Rust : `node --test tests/tracing.test.mjs`.
