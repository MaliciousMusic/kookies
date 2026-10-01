# Kookies Clermont — maquette du site-appli

Site vitrine pensé comme une petite appli : un seul écran, des onglets, pas de long scroll.
HTML/CSS/JS sans framework ni build : ça s'ouvre tel quel et s'héberge n'importe où.

## En ligne

**https://maliciousmusic.github.io/kookies/**

Publié par GitHub Pages depuis la branche `main` du dépôt [MaliciousMusic/kookies](https://github.com/MaliciousMusic/kookies). Mettre à jour le site = estampiller les scripts puis pousser sur `main` (GitHub republie en une minute environ) :

```bash
node tools/bump.mjs
git add -A
git commit -m "Mise à jour"
git push
```

Sur téléphone : « Partager » puis « Sur l'écran d'accueil » (iPhone), ou « Installer l'appli » (Android). L'icône est le logo noir sur blanc.

Tant que c'est une maquette (prix et paiement fictifs), la page est en `noindex` : Google ne la référence pas. À la mise en ligne, remettre `index, follow, max-image-preview:large` dans la balise `robots` de `index.html`, puis mettre le vrai domaine partout :

```bash
node tools/set-domain.mjs https://www.kookies-clermont.fr
```

## Lancer en local

```bash
python -m http.server 5173
```

Puis http://localhost:5173. Un double-clic sur `index.html` marche aussi (sans connexion : pas de polices Google ni de QR code).

## Ce qu'il y a dedans

| Onglet | Contenu |
|---|---|
| **Ouverture** | Le logo en filigrane (centré sur son poids visuel) et « Entrer » : le geste qui autorise le son (les téléphones l'exigent). Les 7 lettres éclosent alors une à une, chacune sur sa note (K-o-o-k… i-e-s !), accord final, puis le logo se fait croquer. Son coupé : elle part toute seule, sans bouton. Une fois par session ; `?intro` dans l'adresse la rejoue ; un tap pendant l'animation la passe. |
| **Barre du haut** | Volets à palettes OPEN · UNTIL · 19H (ou CLOSED · OPENS AT · 11H), centrés. Un tap déplie les horaires de la semaine (en chiffres seuls : 11 → 19) : calendrier à palettes du jour, jour courant surligné. Commande en cours : le sac devient un Kookie qui tourne, pastille « 1 », qui ouvre le ticket. |
| **Fournée** | L'atelier, en boucle (~23 s), avec de vraies mains fines, en manches blanches retroussées : farine versée au doseur dans un saladier en inox, sucre, pépites, spatule ; une boule de pâte prélevée, roulée sur la planche, enfournée (la boule s'étale en cookie épais derrière la vitre), sortie à la manique, puis posée à côté de ses semblables sur sa coupelle, par la main du bon côté. On reste ~4 s devant la vitrine (le cookie fume encore) avant de recommencer. Une graine par cookie. Maintenir le doigt = accélérer. |
| **Carte** | La vitrine en **3D temps réel** (WebGL) : chaque cookie s'attrape et se fait tourner au doigt (inertie, retour en douceur), et se balance doucement au repos. Sélectionner = croquer : une bouchée dans la vitrine, puis la fiche s'ouvre et le cookie se fait croquer tout seul. Les bouchées creusent le volume : on voit la mie (dense, mate) et les pépites coupées ; le Kinder Bueno et le Kinder Country se font croquer avec le cookie (la coupe montre enrobage, gaufrette et crème, ou crème de lait et céréales) ; le XXL se mange en 26 petites bouchées. En tête, le **Kookie du mois** (octobre 2026 : Poire chocolat, refait d'après leur post Instagram du 30/09 : pâte blonde, dés de poire caramélisée, pépites de chocolat noir, filets de chocolat noir fondu versés en zigzag). L'astuce « Attrape un cookie… » s'efface au bout de 6 s. Sans WebGL, la carte retombe sur les cookies 2D. |
| **Boissons** | Le coin barista, à emporter : cafés (espresso, latte, cappuccino), lattes (matcha, aussi sans lactose, chaï, golden, butterfly), thé bio, chocolat chaud, citronnade maison, jus d'orange pressé. Chaque boisson a sa tasse vue de dessus (sa couleur, sa mousse) et un « + » qui l'ajoute à la réservation, comme un Kookie (une boisson ne donne pas de tampon fidélité). En tête, leur gobelet à emporter au manchon kraft, qui fume. |
| **Fidélité** | Carte à créer avec son prénom (écrit en petit à côté du logo), 10 tampons (chaque tampon est un mini cookie unique). Au comptoir, l'équipe tamponne et valide le Kookie offert avec son **code à 4 chiffres** sur le téléphone du client, comme la carte du Café Laitue : 5 essais puis une minute de pause, jusqu'à 10 tampons d'un coup. Une carte pleine = **1** Kookie offert ; une fois validé, une carte neuve commence (les tampons en trop passent dessus). Verso : le QR du n° de carte. |
| **Nous** | « Une histoire d'amour » : leurs posts Instagram en pile, qu'on jette d'un geste (double-tap = j'aime, flèches au clavier), puis la boutique (Itinéraire · Appeler · Instagram sur une ligne), le plan, la FAQ. |
| **Panier** | Réservation + retrait en boutique : jours d'ouverture, créneaux de 30 min, délai de 48 h pour les minis, paiement Stripe **simulé**, ticket + `.ics` pour l'agenda, tampons fidélité automatiques. |

```
index.html            tout le contenu (lisible par Google et les IA, même sans JS)
css/kookies.css       identité : crème, encre, carrelage violet / vieux rose, néon chaud
js/kk-core.js         hasard seedé, bruit simplex, maths, couleurs, sons WebAudio
js/kk-logo.js         le logo officiel vectorisé (généré depuis assets/logo/)
js/kk-bake.js         le four réaliste : cookies épais calculés pixel par pixel + vue 3/4
js/kk-worker.js       le même four, en arrière-plan (workers)
js/kk-hands.js        mains fines et réalistes (3 poses + manique), calculées de la même façon
js/kk-cookie.js       modèle procédural (contour, pépites, morsures) + rendu SVG
js/kk-3d.js           la carte en 3D : maillage calé sur le contour, toppings en vrais objets, bouchées
js/kk-atelier.js      l'atelier de l'accueil (mains, saladier, four, vitrine)
js/kk-shop.js         vitrine, fiche produit, panier, réservation
js/kk-loyalty.js      carte fidélité, code équipe (empreinte SHA-256), QR
js/kk-insta.js        la pile de posts Instagram (section « Nous »)
js/kk-app.js          splash, onglets, feuilles, horloge à volets (heure de Paris)
assets/logo/          logo vectorisé (SVG + JSON des 8 lettres)
assets/img/insta/     les posts de la pile, recadrés en 4:5 (WebP)
tools/set-pin.mjs     changer le code équipe de la carte fidélité
tools/set-domain.mjs  mettre le vrai domaine dans tous les fichiers SEO
tools/bump.mjs        estampiller CSS et JS avant chaque publication (cache de GitHub Pages)
assets/icons/         icônes d'écran d'accueil (logo noir sur blanc), favicon
llms.txt, robots.txt, sitemap.xml, manifest.webmanifest
```

Les produits sont lus depuis le HTML (`#grid .product` et ses `data-*`) : une seule source, crawlable.
Leur aspect vient de `KK.LOOKS` dans `kk-cookie.js` (pâte, garnitures, fleur de sel…). C'est l'aspect visuel, pas la recette.

**Le rendu réaliste** (`kk-bake.js`) construit une carte de hauteur de cookie épais (« chunky » comme en boutique : galet bombé, grosses bosses arrondies, creux profonds, pépites, toppings Kinder Country / crème et barre Bueno / pâte de pistache), une couleur (dorure, sommets qui brunissent, marbrure, chocolat, nappages), puis l'éclaire (diffus, reflets, ombre dans les creux). Pour l'atelier, la même carte de hauteur est projetée en vue 3/4 pour montrer l'épaisseur. Les mains (`kk-hands.js`) utilisent la même méthode : géométrie anatomique, peau éclairée. Le calcul se fait en arrière-plan, dans des workers (`kk-worker.js`, un par cœur libre, jusqu'à 4) : sur téléphone, les textures sortent plusieurs fois plus vite et la page reste fluide (animations, sons). Sans workers (ouverture en `file://`, vieux navigateur), il se fait sur la page, par tranches de 7 ms. Pour comparer, `?noworker` dans l'adresse force l'ancien mode. Chaque texture calculée est ensuite gardée dans le téléphone (IndexedDB) : aux visites suivantes, elle revient en quelques millisecondes au lieu d'être recalculée. Les cookies tirés au hasard (fournées de l'atelier, réassorts de la vitrine) ne sont pas gardés. Chaque nouvelle version du site (`tools/bump.mjs`) repart de zéro et range les anciennes textures. Le SVG garde l'ombre douce, les morsures déchiquetées avec la mie visible et les miettes.

**La 3D de la carte** (`kk-3d.js`) reprend cette carte de hauteur sans l'éclairer : couleur, normales et occlusion partent au GPU, la lumière (chaude, liée à la caméra) est calculée en direct. Le maillage suit le contour exact du cookie ; le bloc de Kinder Country et la barre Bueno sont de vrais objets à part (arêtes arrondies, bosses, cassure qui montre le fourrage), la crème et la pâte de pistache restent des nappages. Une bouchée découpe le topping avec le même masque que le cookie, et une paroi posée sur la morsure montre sa coupe. Un seul contexte WebGL sert toutes les vues.

**Le logo** est le vrai, vectorisé depuis le fichier fourni (`assets/logo/kookies-logo.svg`). Il est utilisé tel quel partout (barre du haut, splash croqué, néon, carte fidélité, icônes) : ne pas le recomposer avec une police.

**Le son** (`kk-core.js`) : un sound design léger, entièrement synthétisé (WebAudio, aucun fichier). Toc feutré sur les boutons, bulles des onglets, marimba des filtres, volets qui claquent comme un tableau de gare, néon qui grésille en s'allumant, feuilles qui glissent, croc, Kookie qui tombe dans le sac en papier, tampon, carte pleine. L'atelier a sa bande-son, calée sur chaque geste et à mi-voix : farine, sucre, pépites, spatule, boule roulée, porte du four, thermostat, ronron du four pendant la cuisson, minuterie, coupelle. Les sons démarrent au premier geste, suivent le mode silencieux de l'iPhone et se coupent avec le haut-parleur de la barre du haut. `data-sfx="nom"` sur un bouton lui donne un son dédié, `data-sfx="none"` le rend muet.

**Le code équipe** (carte fidélité) n'est pas écrit en clair : seule son empreinte est dans `js/kk-loyalty.js`. Code de la maquette : **1119** (11 h → 19 h). Pour le changer :

```bash
node tools/set-pin.mjs 4821
```

Limite d'une carte sans serveur : un client très technique pourrait modifier sa carte, et vider les données du navigateur l'efface. Pour une carte infalsifiable (plusieurs appareils, historique côté boutique), il faut le back-office de la section « Passer en production ».

## À remplacer avant la mise en ligne

- **Prénoms des deux gérantes** : retirés pour l'instant ; un commentaire dans la section « Nous » indique où les citer.
- **Posts Instagram** de la pile : des captures fournies (basse définition), recadrées ; légendes provisoires, sans nombre de j'aime inventé. À remplacer par les originaux HD et leurs vraies légendes (`assets/img/insta/`, 1080 × 1350 idéalement). En prod, on peut les tirer de l'API Instagram (compte pro).
- **Parfums et prix** : le Poire chocolat (Kookie du mois d'octobre), le XXL, le stick, les minis (30 / 50 / 100) et les toppings Pistache, Kinder Country et Kinder Bueno viennent de leur Instagram ou de leurs photos. Le Classique, le Triple Choc et **tous les prix** sont inventés.
- **Téléphone** : 09 53 91 74 12, celui de leur fiche Google Maps (tenue par la boutique, octobre 2026). Il remplace l'ancien +33 4 73 26 27 95, trouvé dans de vieilles fiches.
- **Boissons** : liste reconstituée d'après l'ardoise de la boutique (photo Google Maps, août 2021) et les avis clients 2019–2025. À faire valider (ce qui est encore servi aujourd'hui). **Prix provisoires : 4,50 € partout.**
- **Domaine** : pour l'instant l'adresse GitHub Pages, partout (canonical, og, JSON-LD, robots, sitemap, llms.txt). `node tools/set-domain.mjs https://…` met le vrai domaine d'un coup ; retirer aussi le `noindex`.
- Allergènes, conseil de conservation (leur story « Conservation »), mentions légales, CGV, confidentialité.

## Passer en production

1. **Hébergement statique** (Netlify, Vercel, Cloudflare Pages) + domaine.
2. **Paiement** : une fonction serveur `/api/checkout` crée une session Stripe Checkout. Les prix sont recalculés côté serveur, jamais pris du navigateur. Webhook `checkout.session.completed` → commande confirmée + SMS ou e-mail. CB, Apple Pay et Google Pay sont inclus. Le point d'appel est déjà marqué `PROD` dans `kk-shop.js`.
3. **Données** (Supabase, par exemple) : produits, Kookie du mois, créneaux, commandes, cartes fidélité. Plus un mini back-office pour elles : publier une nouveauté, fermer un créneau, voir les commandes du jour, tamponner (code équipe ou scan du QR).
4. **Nouveautés** : notifications Web Push (l'appli est déjà installable) ou SMS.
5. **Légal** : CGV obligatoires pour la vente en ligne, RGPD pour la carte fidélité.

## SEO local et référencement par les IA

Déjà en place : JSON-LD `Bakery` + `Menu` + `FAQPage`, phrases factuelles et citables, `llms.txt`, robots.txt ouvert aux robots IA (GPTBot, ClaudeBot, PerplexityBot…), géo-balises, manifest.

Le plus rentable ensuite se passe **hors du site** :

- **Nettoyer les annuaires.** Petit Futé et AfterMag affichent encore l'ancienne adresse (7 rue des Gras), la livraison, l'ouverture le dimanche et `kookies-shop.com`, un domaine aujourd'hui parqué. Les IA recopient ces fiches.
- Fiche **Google Business Profile** à jour (horaires, photos, lien de réservation), plus Apple Business Connect et Bing Places.
- Vérifier le point **OpenStreetMap** : beaucoup d'applis et d'IA s'en servent.
- Nom, adresse et téléphone **identiques partout** (site, Insta, Facebook, annuaires).
- Chaque Kookie du mois = une mise à jour datée du site. C'est du contenu frais, et les IA citent volontiers ce genre de fait daté.
- En prod, pré-rendre une URL par onglet (`/carte`, `/fidelite`, `/nous`) au lieu des `#ancres`.
