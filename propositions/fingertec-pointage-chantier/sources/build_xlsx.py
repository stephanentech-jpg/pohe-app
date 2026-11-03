import sys
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
out = sys.argv[1]
BLUE, LIGHT = "1F3864", "DCE6F2"
thin = Side(style="thin", color="A6A6A6"); B = Border(top=thin, bottom=thin, left=thin, right=thin)
common = [
 ("Mini-onduleur 12 V (autonomie en cas de coupure de courant)", 1, 55000),
 ("Boîtier de protection anti-poussière / anti-pluie pour chantier", 1, 85000),
 ("Cartes de proximité RFID (secours si empreinte illisible)", 50, 1500),
 ("Logiciel FingerTec TCMS V3 – licence à vie (paiement unique)", 1, 650000),
 ("Installation, fixation, câblage et mise en service sur chantier", 1, 150000),
 ("Configuration logiciel (horaires, retards, heures sup., import personnel) – incluse", 1, 0),
 ("Formation des utilisateurs (½ journée, jusqu'à 5 personnes)", 1, 75000),
 ("Transport du matériel et mission d'installation Abidjan – Odienné (2 techniciens, 2 jours sur site, A/R, hébergement)", 1, 450000),
]
opts = {
 "Option A - Q2i": ("Pointeuse biométrique FingerTec Q2i (empreinte + carte RFID + code)", 740000),
 "Option B - Face ID 5": ("Pointeuse biométrique FingerTec Face ID 5 (visage + empreinte + carte RFID + code)", 900000),
}
files = {"Option A - Q2i": "Offre_Financiere_Q2i_MATRELEC_Odienne.xlsx", "Option B - Face ID 5": "Offre_Financiere_FaceID5_MATRELEC_Odienne.xlsx"}
for name, (dev, price) in opts.items():
    wb = Workbook(); ws = wb.active; ws.title = name.split(" - ")[1]
    ws["A1"] = f"NTECH SUPPORT – Offre financière – Pointeuse FingerTec {name.split(' - ')[1]} (chantier d'Odienné)"; ws["A1"].font = Font(bold=True, size=13, color=BLUE)
    ws["A2"] = "Offre N° 2611_____ – 3 novembre 2026 – Prix en F CFA – Validité 30 jours"; ws["A2"].font = Font(italic=True, color="595959")
    ws["A3"] = "Client : MATRELEC – Site : chantier d'Odienné"
    hdr = ["N°", "Désignation", "Qté", "P.U. HT (F CFA)", "Montant HT (F CFA)"]
    for c, h in enumerate(hdr, 1):
        cell = ws.cell(row=5, column=c, value=h); cell.font = Font(bold=True, color="FFFFFF")
        cell.fill = PatternFill("solid", fgColor=BLUE); cell.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True); cell.border = B
    sw = "Logiciel FingerTec Ingress – licence à vie (paiement unique)" if "Face" in name else "Logiciel FingerTec TCMS V3 – licence à vie (paiement unique)"
    lines = [(dev, 1, price)] + common[:3] + [(sw, 1, 650000)] + common[4:]
    r = 6
    for i, (d, q, pu) in enumerate(lines, 1):
        ws.cell(row=r, column=1, value=i); ws.cell(row=r, column=2, value=d)
        ws.cell(row=r, column=3, value=q); ws.cell(row=r, column=4, value=pu)
        ws.cell(row=r, column=5, value=f"=C{r}*D{r}")
        r += 1
    first, last = 6, r - 1
    tot = [("TOTAL HT", f"=SUM(E{first}:E{last})"), ("TVA 18 %", f"=ROUND(E{r}*0.18,0)"), ("TOTAL TTC", f"=E{r}+E{r+1}")]
    for k, (lab, f) in enumerate(tot):
        ws.cell(row=r + k, column=2, value=lab); ws.cell(row=r + k, column=5, value=f)
        for c in range(1, 6):
            cell = ws.cell(row=r + k, column=c); cell.fill = PatternFill("solid", fgColor=LIGHT); cell.font = Font(bold=True)
    for row in ws.iter_rows(min_row=6, max_row=r + 2, max_col=5):
        for cell in row:
            cell.border = B; cell.alignment = Alignment(vertical="center", wrap_text=(cell.column == 2), horizontal="center" if cell.column in (1, 3) else None)
            if cell.column in (4, 5): cell.number_format = '#,##0 "F";;"Inclus"'
    n = r + 4
    for line in ["Délai de livraison : 2 à 3 semaines après commande et acompte, + 2 jours d'acheminement à Odienné. Installation : 1 à 2 jours ouvrés.",
                 ("Paiement : 70 % à la commande, 30 % à la réception. Garantie : " + ("24 mois (constructeur FingerTec)." if "Face" in name else "12 mois pièces et main-d'œuvre.")),
                 "Options HT : routeur 4G + remontée au siège 65 000 F ; kit solaire autonome 250 000 F ; maintenance annuelle 650 000 F/an transport compris (dès la 2e année) ; cloud TimeTec TA sur devis."]:
        ws.cell(row=n, column=1, value=line).font = Font(italic=True, size=9); n += 1
    for col, w in zip("ABCDE", (6, 70, 7, 18, 20)): ws.column_dimensions[col].width = w
    ws.freeze_panes = "A6"
    wb.save(f"{out}/{files[name]}"); print("saved", files[name])
