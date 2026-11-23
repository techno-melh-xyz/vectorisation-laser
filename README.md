# Vectorisation Laser — VTracer Rust / WebAssembly

Application Web statique en français : conversion locale de dessins bitmap en SVG pour préparer la découpe laser.

## Mise en ligne sur GitHub Pages

1. Créer un dépôt **public** GitHub, par exemple `vectorisation-laser`.
2. Envoyer **tous les fichiers**, y compris `.github/workflows/pages.yml`, à la racine de la branche `main`.
3. Ouvrir **Settings → Pages → Build and deployment → Source → GitHub Actions**.
4. Dans **Actions**, lancer **Publier Vectorisation Laser** si nécessaire (`Run workflow`).
5. Attendre le succès de la compilation et du déploiement. Le site sera à `https://UTILISATEUR.github.io/vectorisation-laser/` si le dépôt porte ce nom.

Le premier déploiement peut prendre plusieurs minutes. Si la compilation échoue, ouvrir le journal GitHub Actions : le code est fourni comme base de projet et **n'a pas été compilé ni testé dans cet environnement**.

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
