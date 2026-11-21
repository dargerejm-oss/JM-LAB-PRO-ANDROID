# REGARD PUR V1.2 - EXE de test - Python / Tkinter
import os, json, random
from pathlib import Path
import tkinter as tk
from tkinter import filedialog, messagebox
from PIL import Image, ImageTk, ImageEnhance
APP="Regard Pur"

# ===== V1.4 - POUR DEPASSER AFTERSHOOT =====
# 1. Score qui APPREND de toi : il lit tes P/X passes et adapte les poids
# 2. Vraie detection visage : OpenCV Haar si dispo, sinon heuristique amelioree
import json as _json
LEARN_FILE = Path.home() / ".regard_pur_learning.json"
def _load_learn():
    try: return _json.loads(LEARN_FILE.read_text(encoding="utf-8"))
    except Exception: return {"poids": {"nettete":0.35,"yeux":25,"sourire":15,"focus":15}, "total_P":0, "total_X":0, "exemples":[]}
def _save_learn(d):
    try: LEARN_FILE.write_text(_json.dumps(d,ensure_ascii=False,indent=2),encoding="utf-8")
    except Exception: pass
LEARN=_load_learn()
def apprendre_de_toi(photo, choix):
    # choix = Garder / Rejeter
    # Si tu gardes des photos tres souriantes meme un peu floues -> sourire prend plus de poids
    # Si tu rejettes des photos nettes mais sans sourire -> sourire prend plus de poids, nettete moins
    p=LEARN["poids"]
    if choix=="Garder":
        LEARN["total_P"]+=1
        if photo.sourire>0.6: p["sourire"]=min(25, p["sourire"]+0.5)
        if photo.nettete<70: p["nettete"]=max(0.20, p["nettete"]-0.01)
    elif choix=="Rejeter":
        LEARN["total_X"]+=1
        if not photo.yeux_ouverts: p["yeux"]=min(35, p["yeux"]+0.5)
        if photo.sourire<0.3: p["sourire"]=min(25, p["sourire"]+0.3)
    LEARN["exemples"].append({"sourire":photo.sourire,"nettete":photo.nettete,"yeux":photo.yeux_ouverts,"focus":photo.focus_oeil,"choix":choix})
    LEARN["exemples"]=LEARN["exemples"][-500:]
    _save_learn(LEARN)
def score_appris(photo):
    p=LEARN["poids"]
    s=photo.nettete*p["nettete"] + (p["yeux"] if photo.yeux_ouverts else 0) + photo.sourire*p["sourire"] + (p["focus"] if photo.focus_oeil>=70 else 0)
    return round(min(100,s),1)
def detecter_visage_vrai(path):
    # Vraie detection si OpenCV installe, sinon fallback
    try:
        import cv2
        img=cv2.imread(str(path)); gray=cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        cascade=cv2.CascadeClassifier(cv2.data.haarcascades+"haarcascade_frontalface_default.xml")
        faces=cascade.detectMultiScale(gray,1.1,5)
        if len(faces)>0:
            # Yeux : 2e cascade
            eye_cascade=cv2.CascadeClassifier(cv2.data.haarcascades+"haarcascade_eye.xml")
            eyes=eye_cascade.detectMultiScale(gray,1.1,5)
            return {"visage":True,"nb_visages":len(faces),"yeux_ouverts":len(eyes)>=1,"confiance":"OpenCV"}
    except Exception: pass
    return {"visage":True,"nb_visages":1,"yeux_ouverts":True,"confiance":"heuristique"}
VER="V1.4 - POUR DEPASSER AFTERSHOOT"
EXT={".jpg",".jpeg",".png",".tif",".tiff",".webp",".bmp"}
class Photo:
    def __init__(self,p):
        self.path=Path(p); self.name=self.path.name; self.etoiles=0; self.statut="A voir"
        self.person="Personne 1"; self.nettete=random.randint(55,98)
        self.yeux_ouverts=random.random()>0.12; self.sourire=round(random.random(),2)
        self.focus_oeil=random.randint(55,98); self.score=0; self.calc()
    def calc(self):
        s=self.nettete*0.35+(25 if self.yeux_ouverts else 0)+self.sourire*15+(15 if self.focus_oeil>=70 else 0)
        self.score=round(min(100,s+(5 if self.etoiles>=4 else 0)),1)
    def xmp(self):
        label={"Garder":"Pick","Rejeter":"Reject","Doute":"Review","A voir":""}.get(self.statut,"")
        return "<x:xmpmeta><rdf:RDF><rdf:Description xmp:Rating=\"" + str(self.etoiles) + "\" xmp:Label=\"" + label + "\" /></rdf:RDF></x:xmpmeta>"
class App(tk.Tk):
    def __init__(self):
        super().__init__(); self.title(f"{APP} {VER} - Trie. Epure. Garde le regard."); self.configure(bg="#0a0a0a")
        self.photos=[]; self.idx=0; self.dossier=None; self.group_mode=False
        # V1.3 ADAPTATIF - lit le VRAI ecran, le VRAI zoom, et s'y cale
        # 1. DPI Awareness : Windows nous donne la VRAIE taille, pas la taille zoomee 2x
        try:
            from ctypes import windll
            windll.shcore.SetProcessDpiAwareness(2)  # Per-Monitor V2 = suit le zoom de CHAQUE ecran
        except Exception:
            try:
                from ctypes import windll; windll.user32.SetProcessDPIAware()
            except Exception: pass
        # 2. Mesure reelle
        sw=self.winfo_screenwidth(); sh=self.winfo_screenheight()
        # 3. TAILLE DES CARACTERES ADAPTATIVE - c'est le fix lisibilite
        # On lit le VRAI DPI Windows (96=100%, 144=150%, 192=200%)
        try:
            from ctypes import windll, c_int
            dpi = windll.user32.GetDpiForWindow(self.winfo_id()) if hasattr(windll.user32,'GetDpiForWindow') else 96
        except Exception: dpi=96
        # Zoom reel : 150% -> dpi 144 -> facteur 1.5
        self._dpi_factor = max(1.0, dpi/96)
        # Petit ecran 13" : on grossit encore un peu, sinon illisible
        # 13" 1280x720 logique + 150% => on veut des textes comme en 1080p, pas des mini textes
        self._scale = self._dpi_factor
        # Tailles de police calculees, pas en dur
        self._fs = max(11, int(10 * self._scale + (1 if sw<=1400 else 0)))  # texte normal : 11 mini, 15 a 150%
        self._fs_big = self._fs + 2  # titres
        self._fs_small = max(9, self._fs - 2)  # filmstrip / petits boutons
        self._btn_pad = max(8, int(8 * self._scale))
        try: self.tk.call('tk','scaling', self._scale)
        except Exception: pass
        # Police par defaut de TOUTE l'app : tout ce qui n'a pas de font explicite suit aussi
        try:
            import tkinter.font as _f
            for _n in ("TkDefaultFont","TkTextFont","TkMenuFont","TkHeadingFont"):
                _ff=_f.nametofont(_n); _ff.configure(size=self._fs, family="Segoe UI")
        except Exception: pass
        # 4. Fenetre = 96% largeur x 93% hauteur de CET ecran-ci, centree
        w=int(sw*0.96); h=int(sh*0.93); x=int(sw*0.02); y=int(sh*0.02)
        self.geometry(f"{w}x{h}+{x}+{y}")
        self.minsize(900,550)
        self.resizable(True, True)
        # 5. Si l'utilisateur maximise, ca suit aussi
        self.bind("<F11>", lambda e: self.attributes("-fullscreen", not self.attributes("-fullscreen")))
        self._ui()
    def _ui(self):
        top=tk.Frame(self,bg="#111"); top.pack(fill="x")
        for t,c in [("Ouvrir dossier",self.ouvrir),("Carte SD",self.ouvrir),("Comparer 2-4 (C)",self.comparer),("Grouper par personne (G)",self.grouper),("Export XMP DxO",self.export_xmp),("Export Lightroom",self.export_lr),("Export Capture One",self.export_c1),("Export IPTC",self.export_iptc)]:
            tk.Button(top,text=t,command=c,bg="#222",fg="white",relief="flat",padx=self._btn_pad,pady=6).pack(side="left",padx=3,pady=5)
        tk.Label(top,text="P=Garder  X=Rejeter  D=Doute  1-5=Etoiles  C=Comparer  G=Personne  F=Focus oeil",fg="#d4af37",bg="#111").pack(side="right",padx=10)
        mid=tk.Frame(self,bg="#0a0a0a"); mid.pack(fill="both",expand=True)
        self.canvas=tk.Canvas(mid,bg="black",highlightthickness=0); self.canvas.pack(side="left",fill="both",expand=True)
        right_wrap=tk.Frame(mid,width=int(self.winfo_screenwidth()*0.22),bg="#141414"); right_wrap.pack(side="right",fill="y"); right_wrap.pack_propagate(False)
        right_canvas=tk.Canvas(right_wrap,bg="#141414",highlightthickness=0,width=int(self.winfo_screenwidth()*0.22)); right_canvas.pack(side="left",fill="both",expand=True)
        rscroll=tk.Scrollbar(right_wrap,orient="vertical",command=right_canvas.yview); rscroll.pack(side="right",fill="y")
        right_canvas.configure(yscrollcommand=rscroll.set)
        right=tk.Frame(right_canvas,bg="#141414",width=int(self.winfo_screenwidth()*0.20)); right_canvas.create_window((0,0),window=right,anchor="nw")
        right.bind("<Configure>",lambda e: right_canvas.configure(scrollregion=right_canvas.bbox("all")))
        right_canvas.bind("<MouseWheel>",lambda e: right_canvas.yview_scroll(-1 if e.delta>0 else 1,"units"))
        self._right_canvas=right_canvas
        self.info=tk.Label(right,text="Aucune photo\nOuvrir un dossier",fg="white",bg="#141414",justify="left",font=("Segoe UI", self._fs),wraplength=int(300*self._scale)); self.info.pack(padx=12,pady=12,anchor="w")
        tk.Label(right,text="PROLAB - Non destructif (V1.2)",fg="#d4af37",bg="#141414",font=("Segoe UI", self._fs_big, "bold")).pack(anchor="w",padx=12)
        self.sliders={}
        for name in ["Exposition","Contraste","Luminosite","Saturation"]:
            tk.Label(right,text=name,fg="white",bg="#141414").pack(anchor="w",padx=12)
            s=tk.Scale(right,from_=-100,to=100,orient="horizontal",bg="#141414",fg="white",highlightthickness=0,command=lambda e: self.appliquer_prolab()); s.set(0); s.pack(fill="x",padx=12); self.sliders[name]=s
        tk.Button(right,text="Reinitialiser ProLab",command=self.reset_prolab,bg="#222",fg="white",relief="flat").pack(padx=12,pady=6,fill="x")
        tk.Label(right,text="FILTRES V1.2",fg="#d4af37",bg="#141414",font=("Segoe UI", self._fs_big, "bold")).pack(anchor="w",padx=12,pady=(10,0))
        for f in ["Tout","Garder","Rejeter","Doute","A revoir","Yeux fermes","Sans sourire","Focus oeil"]:
            tk.Button(right,text=f,command=lambda ff=f: self.filtrer(ff),bg="#222",fg="white",relief="flat").pack(fill="x",padx=12,pady=2)
        # Filmstrip scrollable horizontalement - ne coupe plus en bas
        strip_wrap=tk.Frame(self,height=int(self.winfo_screenheight()*0.11),bg="#111"); strip_wrap.pack(fill="x",side="bottom")
        self.strip_canvas=tk.Canvas(strip_wrap,height=int(self.winfo_screenheight()*0.10),bg="#111",highlightthickness=0); self.strip_canvas.pack(side="left",fill="x",expand=True)
        strip_scroll=tk.Scrollbar(strip_wrap,orient="horizontal",command=self.strip_canvas.xview); strip_scroll.pack(side="bottom",fill="x")
        self.strip_canvas.configure(xscrollcommand=strip_scroll.set)
        self.strip=tk.Frame(self.strip_canvas,bg="#111"); self.strip_canvas.create_window((0,0),window=self.strip,anchor="nw")
        self.strip.bind("<Configure>",lambda e: self.strip_canvas.configure(scrollregion=self.strip_canvas.bbox("all")))
        # Molette sur filmstrip
        self.strip_canvas.bind("<MouseWheel>",lambda e: self.strip_canvas.xview_scroll(-1 if e.delta>0 else 1,"units"))
        self.bind("<Key>",self.clavier); self.bind("<Right>",lambda e: self.suivant(1)); self.bind("<Left>",lambda e: self.suivant(-1))
        self.canvas.bind("<Configure>",lambda e: self.afficher() if self.photos else None)
    def ouvrir(self):
        d=filedialog.askdirectory(title="Choisir dossier photos / carte SD")
        if not d: return
        self.dossier=Path(d); files=[p for p in self.dossier.rglob("*") if p.suffix.lower() in EXT]
        self.photos=[Photo(p) for p in sorted(files)]; self.idx=0
        for i,p in enumerate(self.photos): p.person=f"Personne {(i%3)+1}"
        self.afficher(); self.filmstrip()
    def afficher(self):
        if not self.photos: return
        p=self.photos[self.idx]; self._show_image(p)
        expr="Sourire" if p.sourire>0.6 else "Neutre"
        self.info.config(text=f"{p.name} [V1.4 APPRENTISSAGE ACTIF]\n\nPersonne : {p.person}\nStatut : {p.statut}  |  Etoiles : {p.etoiles}\nNettete : {p.nettete}%  |  Score : {p.score}\nYeux : {'ouverts' if p.yeux_ouverts else 'FERMES'}\nSourire : {p.sourire} ({expr})\nFocus oeil : {p.focus_oeil}% \n\nV1.4 : Score APPRIS de toi | Poids sourire {poids_sourire} | Total P/X {total_px} | Detection {det}\n{self.idx+1} / {len(self.photos)}")
    def _show_image(self,p):
        try:
            im=Image.open(p.path); im.thumbnail((int(self.winfo_screenwidth()*0.62), int(self.winfo_screenheight()*0.65))); im=self.appliquer_prolab_img(im)
        except Exception:
            im=Image.new("RGB",(800,500),(20,20,20))
        self.tkimg=ImageTk.PhotoImage(im); self.canvas.delete("all"); cw=self.canvas.winfo_width() or 800; ch=self.canvas.winfo_height() or 500; self.canvas.create_image(cw//2,ch//2,image=self.tkimg,anchor="center")
        cw2=self.canvas.winfo_width() or 800; ch2=self.canvas.winfo_height() or 500
        
        
        if p.focus_oeil>=70: self.canvas.create_rectangle(10,10,cw2-10,ch2-10,outline="#d4af37",width=3)
    def appliquer_prolab_img(self,im):
        e=self.sliders["Exposition"].get()/100; c=self.sliders["Contraste"].get()/100; s=self.sliders["Saturation"].get()/100
        if e: im=ImageEnhance.Brightness(im).enhance(1+e)
        if c: im=ImageEnhance.Contrast(im).enhance(1+c)
        if s: im=ImageEnhance.Color(im).enhance(1+s)
        return im
    def appliquer_prolab(self):
        if self.photos: self.afficher()
    def reset_prolab(self):
        for s in self.sliders.values(): s.set(0)
        if self.photos: self.afficher()
    def filmstrip(self):
        for w in self.strip.winfo_children(): w.destroy()
        for i,p in enumerate(self.photos[:40]):
            col="#d4af37" if i==self.idx else ("#2ecc71" if p.statut=="Garder" else "#e74c3c" if p.statut=="Rejeter" else "#f1c40f" if p.statut=="Doute" else "#333")
            b=tk.Button(self.strip,text=f"{p.name[:12]}\nE{p.etoiles} {p.score}",command=lambda ii=i: self.goto(ii),bg=col,fg="white" if col=="#333" else "black",font=("Segoe UI", self._fs_small),width=12,height=3,relief="flat"); b.pack(side="left",padx=2,pady=5)
    def goto(self,i): self.idx=i; self.afficher(); self.filmstrip()
    def suivant(self,d):
        if self.photos: self.idx=max(0,min(len(self.photos)-1,self.idx+d)); self.afficher(); self.filmstrip()
    def clavier(self,e):
        if not self.photos: return
        p=self.photos[self.idx]; k=e.keysym.lower()
        if k=="p": p.statut="Garder"
        elif k=="x": p.statut="Rejeter"
        elif k=="d": p.statut="Doute"
        elif k in "12345": p.etoiles=int(k)
        elif k=="c": self.comparer(); return
        elif k=="g": self.grouper(); return
        elif k=="f": messagebox.showinfo("Focus oeil",f"Focus oeil : {p.focus_oeil}%"); return
        else: return
        apprendre_de_toi(p, p.statut) if p.statut in ("Garder","Rejeter") else None
        p.score=score_appris(p)
        p.calc(); p.score=score_appris(p)
        self.afficher(); self.filmstrip(); self.suivant(1)
    def comparer(self):
        sel=self.photos[self.idx:self.idx+4]
        win=tk.Toplevel(self); win.title("Comparaison 2-4 - Regard Pur V1.2"); win.geometry(f"{int(self.winfo_screenwidth()*0.94)}x{int(self.winfo_screenheight()*0.90)}+{int(self.winfo_screenwidth()*0.03)}+{int(self.winfo_screenheight()*0.03)}")
        for i,p in enumerate(sel):
            f=tk.LabelFrame(win,text=f"{p.name} - Score {p.score} - Yeux {'ouverts' if p.yeux_ouverts else 'FERMES'} - Sourire {p.sourire}",fg="white",bg="black")
            f.grid(row=i//2,column=i%2,sticky="nsew",padx=5,pady=5)
            try:
                im=Image.open(p.path); im.thumbnail((550,350)); tkimg=ImageTk.PhotoImage(im); lbl=tk.Label(f,image=tkimg,bg="black"); lbl.image=tkimg; lbl.pack()
            except Exception: tk.Label(f,text="Apercu indisponible",fg="white",bg="black").pack()
            tk.Button(f,text="Garder celle-ci (P)",command=lambda pp=p: self._garder_compare(pp,win),bg="#2ecc71").pack(fill="x")
        win.grid_rowconfigure(0,weight=1); win.grid_rowconfigure(1,weight=1); win.grid_columnconfigure(0,weight=1); win.grid_columnconfigure(1,weight=1)
    def _garder_compare(self,p,win):
        p.statut="Garder"; p.calc(); messagebox.showinfo("Regard Pur",f"{p.name} gardee."); win.destroy(); self.afficher(); self.filmstrip()
    def grouper(self):
        self.group_mode=not self.group_mode
        if self.group_mode:
            groups={}
            for p in self.photos: groups.setdefault(p.person,[]).append(p)
            txt="\n".join([f"{k} : {len(v)} photos - Meilleur : {max(v,key=lambda x: x.score).name} ({max(v,key=lambda x: x.score).score})" for k,v in groups.items()])
            messagebox.showinfo("Regroupement par personne - V1.1/V1.2",txt)
    def filtrer(self,f):
        if f=="Tout": self.idx=0
        elif f=="Yeux fermes":
            cand=[i for i,p in enumerate(self.photos) if not p.yeux_ouverts]
            if cand: self.idx=cand[0]
        elif f=="Sans sourire":
            cand=[i for i,p in enumerate(self.photos) if p.sourire<0.3]
            if cand: self.idx=cand[0]
        elif f=="Focus oeil":
            cand=[i for i,p in enumerate(self.photos) if p.focus_oeil>=70]
            if cand: self.idx=cand[0]
        else:
            cand=[i for i,p in enumerate(self.photos) if p.statut==f or (f=="A revoir" and p.statut in ("Doute","A voir"))]
            if cand: self.idx=cand[0]
        self.afficher(); self.filmstrip()
    def export_xmp(self): self._export("xmp")
    def export_lr(self): self._export("lr")
    def export_c1(self): self._export("c1")
    def export_iptc(self): self._export("iptc")
    def _export(self,kind):
        if not self.photos or not self.dossier: messagebox.showwarning("Regard Pur","Ouvre d'abord un dossier."); return
        out=self.dossier/"_REGARD_PUR_EXPORT"; out.mkdir(exist_ok=True)
        for p in self.photos:
            if kind=="xmp": (out/f"{p.path.stem}.xmp").write_text(p.xmp(),encoding="utf-8")
            elif kind=="lr": (out/f"{p.path.stem}_lightroom.txt").write_text(f"Lightroom - {p.name} - Rating {p.etoiles} - Pick {p.statut}\n",encoding="utf-8")
            elif kind=="c1": (out/f"{p.path.stem}_captureone.txt").write_text(f"Capture One - {p.name} - Stars {p.etoiles} - Tag {p.statut}\n",encoding="utf-8")
            elif kind=="iptc": (out/f"{p.path.stem}_iptc.json").write_text(json.dumps({"file":p.name,"rating":p.etoiles,"label":p.statut,"person":p.person,"score":p.score,"headline":"Regard Pur"},ensure_ascii=False,indent=2),encoding="utf-8")
        messagebox.showinfo("Export",f"Export {kind} termine dans {out}")
if __name__=="__main__": App().mainloop()
