const fs = require("fs");
const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, WidthType,
  AlignmentType, ShadingType, BorderStyle, Header, Footer, PageNumber, LevelFormat,
  HeadingLevel, PageBreak, TabStopType,
} = require("docx");

const OUT = process.argv[2];
const BLUE = "1F3864";
const LIGHT = "DCE6F2";
const GREY = "F2F2F2";
const FONT = "Arial";

// ---------- helpers ----------
const t = (text, o = {}) => new TextRun({ text, font: FONT, size: o.size || 20, bold: o.bold, italics: o.italics, color: o.color });
const p = (children, o = {}) => new Paragraph({
  children: Array.isArray(children) ? children : [t(children, o)],
  alignment: o.align, spacing: { before: o.before ?? 0, after: o.after ?? 100 },
  keepNext: o.keepNext,
});
const h1 = (text) => new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun({ text, font: FONT })] });
const h2 = (text) => new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun({ text, font: FONT })] });
const bullet = (text, boldLead) => new Paragraph({
  numbering: { reference: "bul", level: 0 }, spacing: { after: 60 },
  children: boldLead ? [t(boldLead, { bold: true }), t(text)] : [t(text)],
});

const border = { style: BorderStyle.SINGLE, size: 4, color: "A6A6A6" };
const borders = { top: border, bottom: border, left: border, right: border };

function table(widths, rows, o = {}) {
  const total = widths.reduce((a, b) => a + b, 0);
  return new Table({
    width: { size: total, type: WidthType.DXA },
    columnWidths: widths,
    rows: rows.map((r, ri) => {
      const isHead = ri === 0 && o.header !== false;
      const isTotal = o.totalRows && o.totalRows.includes(ri);
      return new TableRow({
        tableHeader: isHead,
        cantSplit: true,
        children: r.map((cell, ci) => {
          const align = (o.right || []).includes(ci) && !isHead ? AlignmentType.RIGHT
            : (o.center || []).includes(ci) || isHead ? AlignmentType.CENTER : AlignmentType.LEFT;
          const fill = isHead ? BLUE : isTotal ? LIGHT : (o.firstColShade && ci === 0 ? GREY : undefined);
          const lines = String(cell).split("|");
          return new TableCell({
            width: { size: widths[ci], type: WidthType.DXA },
            borders,
            shading: fill ? { fill, type: ShadingType.CLEAR, color: "auto" } : undefined,
            margins: { top: 60, bottom: 60, left: 100, right: 100 },
            children: lines.map((line) => new Paragraph({
              alignment: align, spacing: { after: 0 },
              children: [t(line, { bold: isHead || isTotal || (o.firstColBold && ci === 0), color: isHead ? "FFFFFF" : undefined, size: o.size || 18 })],
            })),
          });
        }),
      });
    }),
  });
}

const fcfa = (n) => n === 0 ? "Inclus" : n.toLocaleString("fr-FR").replace(/ | /g, " ") + " F";

// ---------- pricing (F CFA HT) ----------
const common = [
  ["Mini-onduleur 12 V (autonomie en cas de coupure de courant)", 1, 55000],
  ["Boîtier de protection anti-poussière / anti-pluie pour chantier", 1, 85000],
  ["Cartes de proximité RFID (secours si empreinte illisible) – lot", 50, 1500],
  ["Logiciel de gestion des présences FingerTec TCMS V3 – licence perpétuelle", 1, 0],
  ["Installation, fixation, câblage et mise en service sur chantier", 1, 150000],
  ["Configuration logiciel (horaires, règles retards / heures sup., import du personnel)", 1, 0],
  ["Formation des utilisateurs (½ journée, jusqu'à 5 personnes)", 1, 75000],
  ["Transport du matériel et mission d'installation Abidjan – Odienné (2 techniciens, aller-retour, hébergement)", 1, 350000],
];
const optA = [["Pointeuse biométrique FingerTec Q2i (empreinte + carte RFID + code)", 1, 740000], ...common];
const optB = [["Pointeuse biométrique FingerTec Face ID 5 (empreinte + visage + paume + carte RFID)", 1, 900000], ...common];

function priceTable(lines) {
  let ht = 0;
  const rows = [["N°", "Désignation", "Qté", "P.U. HT", "Montant HT"]];
  lines.forEach(([d, q, pu], i) => { ht += q * pu; rows.push([String(i + 1), d, String(q), fcfa(pu), fcfa(q * pu)]); });
  const tva = Math.round(ht * 0.18);
  rows.push(["", "TOTAL HT", "", "", fcfa(ht)]);
  rows.push(["", "TVA 18 %", "", "", fcfa(tva)]);
  rows.push(["", "TOTAL TTC", "", "", fcfa(ht + tva)]);
  const n = rows.length;
  return { tbl: table([600, 5000, 600, 1400, 1426], rows, { right: [3, 4], center: [0, 2], totalRows: [n - 3, n - 2, n - 1] }), ht, tva };
}
const A = priceTable(optA);
const B = priceTable(optB);

// ---------- document ----------
const header = new Header({ children: [
  new Paragraph({
    tabStops: [{ type: TabStopType.RIGHT, position: 9706 }],
    border: { bottom: { style: BorderStyle.SINGLE, size: 12, color: BLUE, space: 4 } },
    spacing: { after: 0 },
    children: [
      new TextRun({ text: "NTECH SUPPORT", font: FONT, size: 26, bold: true, color: BLUE }),
      new TextRun({ text: "\t1ère Centrale d'Achat de Côte d'Ivoire", font: FONT, size: 16, italics: true, color: "595959" }),
    ],
  }),
]});
const footer = new Footer({ children: [
  new Paragraph({
    alignment: AlignmentType.CENTER, spacing: { after: 0 },
    border: { top: { style: BorderStyle.SINGLE, size: 4, color: "A6A6A6", space: 4 } },
    children: [t("Marcory Zone 4C, Bd du 7 Décembre – 26 BP 678 Abidjan 26 – Tél. (225) 27 21 24 08 64 – Fax (225) 27 21 24 08 74 – www.ntech-support.com", { size: 14, color: "595959" })],
  }),
  new Paragraph({
    alignment: AlignmentType.CENTER, spacing: { after: 0 },
    children: [new TextRun({ font: FONT, size: 14, color: "595959", children: ["Revendeur agréé FingerTec en Côte d'Ivoire – Page ", PageNumber.CURRENT, " / ", PageNumber.TOTAL_PAGES] })],
  }),
]});

const body = [];

// Title block
body.push(p([new TextRun({ text: "OFFRE TECHNIQUE ET FINANCIÈRE", font: FONT, size: 36, bold: true, color: BLUE })], { align: AlignmentType.CENTER, before: 200, after: 60 }));
body.push(p([t("Système de pointage biométrique et de gestion des présences FingerTec – Chantier", { size: 24, bold: true })], { align: AlignmentType.CENTER, after: 240 }));

body.push(table([2400, 6626], [
  ["Offre N°", "2611_____ (à compléter)"],
  ["Date", "3 novembre 2026"],
  ["Client", "MATRELEC"],
  ["Site d'installation", "Chantier d'Odienné"],
  ["Objet", "Fourniture, installation, configuration et formation – pointeuse biométrique par empreinte digitale et logiciel de gestion des présences pour chantier"],
  ["Validité de l'offre", "30 jours à compter de la date d'émission"],
  ["Interlocuteur", "Stéphane POHE – Technical Manager – Cel. (225) 07 48 27 07 93 – stephane.ntech@gmail.com"],
], { header: false, firstColShade: true, firstColBold: true, size: 19 }));

body.push(p("", { after: 120 }));
body.push(p("Madame, Monsieur,", { after: 120 }));
body.push(p("Nous vous remercions pour votre demande et avons le plaisir de vous soumettre notre proposition technique et financière pour la mise en place d'un système de gestion des présences par empreinte digitale sur votre chantier d'Odienné. NTECH SUPPORT est revendeur agréé FingerTec en Côte d'Ivoire : le matériel est commandé directement auprès du fabricant, ce qui garantit l'authenticité des produits, la garantie constructeur et l'accès au support technique FingerTec. Nos équipes interviennent déjà dans la région d'Odienné.", { after: 120 }));

// 1. Besoin
body.push(h1("1. Compréhension du besoin"));
body.push(p("Votre demande et les contraintes propres à un chantier nous conduisent aux exigences suivantes :"));
[
  ["pointage fiable par empreinte digitale, avec une alternative (carte ou visage) pour les ouvriers dont les empreintes sont abîmées par le travail manuel ;", "Identification : "],
  ["fonctionnement complet sans Internet, avec possibilité de connexion au siège lorsque le réseau est disponible ;", "Connectivité : "],
  ["protection contre la poussière (harmattan), la pluie et les coupures de courant ;", "Environnement : "],
  ["site situé à Odienné, à environ 850 km d'Abidjan : système autonome, peu de maintenance, suivi possible à distance depuis le siège ;", "Éloignement : "],
  ["gestion des horaires, retards, absences et heures supplémentaires, avec export des rapports en Excel (XLSX) et CSV ;", "Exploitation : "],
  ["installation, configuration, formation, garantie et service après-vente assurés localement.", "Accompagnement : "],
].forEach(([x, b]) => body.push(bullet(x, b)));

// 2. Solution
body.push(h1("2. Architecture de la solution proposée"));
body.push(p("La pointeuse est installée à l'entrée du chantier, à l'abri (guérite, bungalow ou base vie), dans un boîtier de protection et alimentée par un mini-onduleur. Chaque pointage est enregistré dans la mémoire interne de la pointeuse, ce qui rend le système indépendant du réseau."));
body.push(table([2300, 6726], [
  ["Mode", "Fonctionnement"],
  ["Hors connexion Internet", "La pointeuse fonctionne de façon autonome et stocke les pointages. Les données sont récupérées sur le PC de gestion (logiciel TCMS V3) par réseau local (câble Ethernet / routeur sur site). Sur le modèle Q2i, la récupération est aussi possible par clé USB. Aucun abonnement ni Internet n'est requis."],
  ["Avec connexion Internet", "La pointeuse est raccordée en TCP/IP à un routeur 4G sur le chantier (option). Le logiciel installé au siège de MATRELEC télécharge automatiquement les pointages d'Odienné, ou les données sont envoyées vers la plateforme cloud TimeTec TA (option) pour une consultation à distance en temps réel."],
], { firstColBold: true, size: 18 }));

// 3. Modèles
body.push(h1("3. Modèles de pointeuses FingerTec proposés"));
body.push(p("Nous vous proposons deux modèles actuels de la gamme FingerTec. Le modèle Face ID 6, arrêté par le fabricant, a été remplacé par le Face ID 5, qui ajoute la reconnaissance par empreinte digitale."));
body.push(table([2626, 3200, 3200], [
  ["Caractéristique", "Option A – FingerTec Q2i", "Option B – FingerTec Face ID 5 (recommandée)"],
  ["Positionnement", "Pointeuse empreinte digitale – solution économique", "Terminal hybride multi-biométrique – meilleure fiabilité sur chantier"],
  ["Modes d'identification", "Empreinte digitale, carte RFID, code PIN", "Empreinte digitale, visage, paume, carte RFID, code PIN"],
  ["Capacité empreintes", "3 000", "10 000 (+ 10 000 visages, 3 000 paumes)"],
  ["Mémoire de pointages", "120 000 transactions", "200 000 transactions"],
  ["Communication", "TCP/IP, USB (clé), RS232/RS485", "TCP/IP"],
  ["Points forts chantier", "Simple, robuste, export par clé USB sans réseau", "Pointage sans contact (visage/paume) si l'empreinte est usée ou sale ; caméra 2 MP faible luminosité"],
  ["Logiciel inclus", "TCMS V3 (licence incluse)", "TCMS V3 (licence incluse)"],
  ["Garantie", "12 mois", "12 mois"],
], { firstColShade: true, firstColBold: true, size: 17 }));
body.push(p([t("Notre recommandation : ", { bold: true }), t("sur un chantier, une partie des ouvriers a des empreintes usées, coupées ou souillées (ciment, peinture). Le Face ID 5 permet à ces personnes de pointer par le visage ou la paume, sans carte à gérer ni risque de pointage pour un collègue. C'est le modèle le plus vendu de la gamme FingerTec.", { italics: true })], { before: 120 }));

// 4. Logiciel
body.push(h1("4. Logiciel de gestion des présences"));
body.push(h2("4.1 FingerTec TCMS V3 – inclus"));
body.push(p("TCMS V3 est le logiciel de gestion des présences de FingerTec. Il s'installe sur un PC Windows du chantier ou du siège et fonctionne entièrement en local, sans Internet."));
[
  ["plannings fixes, rotatifs (équipes / postes) et horaires flexibles, jours fériés et repos ;", "Horaires : "],
  ["calcul automatique des retards, départs anticipés et absences, gestion des congés et justificatifs ;", "Retards et absences : "],
  ["calcul des heures supplémentaires selon les règles de l'entreprise (seuils, arrondis, majorations) ;", "Heures supplémentaires : "],
  ["feuilles de présence, rapports journaliers / mensuels, récapitulatifs par employé ou par équipe ;", "Rapports : "],
  ["export des rapports en Excel (XLSX) et CSV, pour la paie ou un traitement complémentaire ;", "Export : "],
  ["gestion de plusieurs pointeuses et de plusieurs sites (chantiers) depuis un même poste.", "Évolutivité : "],
].forEach(([x, b]) => body.push(bullet(x, b)));
body.push(h2("4.2 Conditions de licence"));
body.push(table([2626, 6400], [
  ["Logiciel", "Conditions"],
  ["TCMS V3 (local)", "Licence perpétuelle fournie gratuitement avec chaque pointeuse FingerTec, activée avec le numéro de série de l'appareil. Aucun abonnement, aucune redevance annuelle, mises à jour logicielles gratuites."],
  ["TimeTec TA (cloud, option)", "Abonnement annuel calculé par employé. Consultation des présences à distance (navigateur et application mobile), alertes, multi-chantiers. Tarif communiqué sur demande selon votre effectif."],
], { firstColBold: true, size: 18 }));

// 5. Prestations
body.push(h1("5. Prestations incluses"));
body.push(h2("5.1 Installation et configuration"));
[
  "visite et choix de l'emplacement de la pointeuse (abri, hauteur, éclairage, alimentation) ;",
  "fixation de la pointeuse dans son boîtier de protection, raccordement électrique et mini-onduleur ;",
  "installation de TCMS V3 sur votre PC et connexion à la pointeuse (réseau local ou USB) ;",
  "paramétrage des horaires, des règles de retard, d'absence et d'heures supplémentaires selon votre règlement ;",
  "import de la liste du personnel, enrôlement des empreintes (et visages pour le Face ID 5) avec votre référent ;",
  "tests de pointage, de récupération des données et d'export Excel / CSV, puis procès-verbal de réception.",
].forEach((x) => body.push(bullet(x)));
body.push(h2("5.2 Formation des utilisateurs"));
[
  ["administrateurs RH / chefs de chantier, jusqu'à 5 personnes, ½ journée sur site ;", "Public : "],
  ["enrôlement des employés, récupération des pointages, corrections, édition des rapports, exports XLSX / CSV, sauvegarde ;", "Contenu : "],
  ["remise d'un guide d'utilisation simplifié en français.", "Support : "],
].forEach(([x, b]) => body.push(bullet(x, b)));

// 6. Offre financière
body.push(new Paragraph({ children: [new PageBreak()] }));
body.push(h1("6. Offre financière"));
body.push(p("Prix exprimés en francs CFA, pour une pointeuse installée sur le chantier d'Odienné, transport et mission d'installation compris. Pour plusieurs pointeuses sur le même site, seuls le matériel et l'installation sont ajoutés : la mission de déplacement n'est facturée qu'une fois."));
body.push(h2("Option A – Pointeuse FingerTec Q2i"));
body.push(A.tbl);
body.push(p("", { after: 120 }));
body.push(h2("Option B – Pointeuse FingerTec Face ID 5 (recommandée)"));
body.push(B.tbl);
body.push(p("", { after: 120 }));
body.push(h2("Options complémentaires"));
body.push(table([5600, 3426], [
  ["Désignation", "Prix HT"],
  ["Pointeuse supplémentaire sur le même site (matériel, accessoires, installation)", "Prix des lignes 1 à 7 de l'option choisie"],
  ["Routeur 4G + configuration de la remontée des pointages vers le siège", "65 000 F"],
  ["Kit d'alimentation solaire autonome pour la pointeuse (panneau, batterie, régulateur), si le site n'a pas de courant stable", "250 000 F"],
  ["Abonnement cloud TimeTec TA (consultation à distance)", "Sur devis selon effectif"],
  ["Contrat de maintenance annuel (à partir de la 2e année) : 1 visite préventive sur site, assistance à distance prioritaire", "250 000 F / an"],
], { right: [1], size: 18 }));

// 7. Conditions
body.push(h1("7. Conditions commerciales"));
body.push(table([2626, 6400], [
  ["Rubrique", "Conditions"],
  ["Délai de livraison", "2 à 3 semaines après réception du bon de commande et de l'acompte (importation directe FingerTec), plus 2 jours d'acheminement jusqu'à Odienné."],
  ["Délai d'installation", "1 à 2 jours ouvrés sur site après livraison, formation comprise."],
  ["Modalités de paiement", "60 % à la commande, 40 % à la réception de l'installation."],
  ["Garantie", "12 mois pièces et main-d'œuvre sur la pointeuse à compter de la réception. Exclusions : casse, choc, surtension, intervention d'un tiers, usage non conforme."],
  ["Service après-vente", "Assistance téléphonique et à distance aux heures ouvrables ; intervention sur site à Odienné sous 72 heures ouvrées (déplacement facturé hors garantie) ; remplacement ou réparation via le fabricant FingerTec pendant la garantie."],
  ["Validité", "30 jours à compter de la date de l'offre."],
], { firstColShade: true, firstColBold: true, size: 18 }));

body.push(p("Nous restons à votre disposition pour une démonstration ou une visite du chantier afin d'affiner la proposition (nombre d'employés, nombre d'accès, horaires de travail).", { before: 200, after: 200 }));
body.push(p("Veuillez agréer, Madame, Monsieur, l'expression de nos salutations distinguées.", { after: 360 }));
body.push(table([4513, 4513], [
  ["Pour NTECH SUPPORT", "Bon pour accord – Le Client"],
  ["Stéphane POHE|Technical Manager||||(Signature et cachet)", "Nom :|Fonction :|Date :|||(Signature et cachet)"],
], { size: 18 }));

const doc = new Document({
  creator: "NTECH SUPPORT",
  title: "Offre technique et financière – Pointage biométrique FingerTec",
  styles: {
    default: { document: { run: { font: FONT, size: 20 } } },
    paragraphStyles: [
      { id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { font: FONT, size: 26, bold: true, color: BLUE },
        paragraph: { spacing: { before: 280, after: 120 }, keepNext: true, outlineLevel: 0 } },
      { id: "Heading2", name: "Heading 2", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { font: FONT, size: 22, bold: true, color: BLUE },
        paragraph: { spacing: { before: 180, after: 80 }, keepNext: true, outlineLevel: 1 } },
    ],
  },
  numbering: { config: [{ reference: "bul", levels: [{ level: 0, format: LevelFormat.BULLET, text: "•", alignment: AlignmentType.LEFT,
    style: { paragraph: { indent: { left: 500, hanging: 260 } } } }] }] },
  sections: [{
    properties: { page: { margin: { top: 1300, bottom: 1200, left: 1100, right: 1100, header: 500, footer: 450 } } },
    headers: { default: header }, footers: { default: footer },
    children: body,
  }],
});

Packer.toBuffer(doc).then((buf) => { fs.writeFileSync(OUT, buf); console.log("written", OUT, "A HT", A.ht, "B HT", B.ht); });
