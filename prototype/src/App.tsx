import { useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  ArrowLeft, ArrowRight, Bell, BookImage, BookOpen, Boxes, Check, CheckCircle2,
  ChevronDown, ChevronRight, CircleHelp, Clock3, FileText, Feather, FolderOpen,
  GalleryVerticalEnd, Home, Image, LayoutGrid, Library, LockKeyhole, Menu, MessageSquare,
  Mic, MoreHorizontal, Paintbrush, PanelTop, Plus, RefreshCw, Search, Send,
  Settings, Sparkles, Stars, UserRound, Users, WandSparkles, X,
} from "lucide-react";
import { Button } from "./components/ui/button";
import { Card, CardContent } from "./components/ui/card";
import { Input } from "./components/ui/input";
import { Textarea } from "./components/ui/textarea";
import { cn } from "./lib/utils";

type Screen = "dashboard" | "builder";
type Stage = "story" | "question" | "details" | "plot" | "style" | "characters" | "sheet" | "review" | "generating" | "ready";
type ArtifactStatus = "confirmed" | "review" | "draft" | "locked" | "generating";
type Answer = { label: string; value: string };

const STORAGE_KEY = "kid-comics-professional-v3";
const TESTER_STORY = "On his morning route, Milo the postcat finds a tiny unaddressed letter and discovers it is a village-wide thank-you meant for him.";
const TESTER_CHOICE = "A thank-you letter from the whole village";
const TESTER_DETAILS = ["Gentle mystery", "Everyday kindness"];
const TESTER_STYLE = "luminous";
const TESTER_LEAD = "Milo";
const TESTER_SUPPORT = ["Bunny", "Bear", "Mouse"];
const flow: Stage[] = ["story", "question", "details", "plot", "style", "characters", "sheet", "review", "generating", "ready"];
const styles = [
  { id: "luminous", title: "Luminous storybook", desc: "Painterly light, rich teal shadows, glowing environments.", image: "./assets/style-luminous-village.png" },
  { id: "golden", title: "Golden garden", desc: "Soft afternoon warmth with bright botanical details.", image: "./assets/style-golden-garden.png" },
  { id: "cozy", title: "Cozy cottage", desc: "Rounded shapes, calm compositions, and tactile texture.", image: "./assets/style-cozy-cottage.png" },
];
const pages = [
  ["cover", "Cover", "Milo rides through sunny Poppywick while Bunny, Bear, and Mouse greet him along his route."],
  ["page-1", "Page 1", "Milo’s bell rings as he delivers birthday wishes, recipes, and letters from far away."],
  ["page-2", "Page 2", "At the bottom of Milo’s satchel, a tiny envelope waits with no name and no address."],
  ["page-3", "Page 3", "Bunny, Bear, and Mouse search the village, but nobody is waiting for the little letter."],
  ["page-4", "Page 4", "The friends notice a tiny paw print beside the seal, and it matches Milo’s own paw."],
  ["page-5", "Page 5", "Milo opens the village’s thank-you and learns that his everyday kindness makes Poppywick feel like home."],
];

function stageIndex(stage: Stage) { return flow.indexOf(stage); }

export default function App() {
  const [screen, setScreen] = useState<Screen>("dashboard");
  const [stage, setStage] = useState<Stage>("story");
  const [storyline, setStoryline] = useState("");
  const [choice, setChoice] = useState("");
  const [details, setDetails] = useState<string[]>([]);
  const [customDetail, setCustomDetail] = useState("");
  const [selectedStyle, setSelectedStyle] = useState("");
  const [leadName, setLeadName] = useState("");
  const [supportRoles, setSupportRoles] = useState<string[]>([]);
  const [answers, setAnswers] = useState<Answer[]>([]);
  const [confirmedPages, setConfirmedPages] = useState<string[]>([]);
  const [activeArtifact, setActiveArtifact] = useState("");
  const [isThinking, setIsThinking] = useState(false);
  const [mobileNav, setMobileNav] = useState(false);
  const [artifactPanelOpen, setArtifactPanelOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        const data = JSON.parse(saved);
        if (data.stage) setStage(data.stage); if (data.storyline) setStoryline(data.storyline);
        if (data.choice) setChoice(data.choice); if (data.details) setDetails(data.details);
        if (data.selectedStyle) setSelectedStyle(data.selectedStyle); if (data.leadName) setLeadName(data.leadName);
        if (data.supportRoles) setSupportRoles(data.supportRoles); if (data.answers) setAnswers(data.answers);
        if (data.confirmedPages) setConfirmedPages(data.confirmedPages);
      } catch { localStorage.removeItem(STORAGE_KEY); }
    }
    setLoaded(true);
  }, []);
  useEffect(() => {
    if (!loaded) return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ stage, storyline, choice, details, selectedStyle, leadName, supportRoles, answers, confirmedPages }));
  }, [stage, storyline, choice, details, selectedStyle, leadName, supportRoles, answers, confirmedPages, loaded]);

  const resetNew = () => {
    window.clearTimeout(timer.current); localStorage.removeItem(STORAGE_KEY);
    setStage("story"); setStoryline(""); setChoice(""); setDetails([]); setCustomDetail("");
    setSelectedStyle(""); setLeadName(""); setSupportRoles([]); setAnswers([]); setConfirmedPages([]);
    setActiveArtifact(""); setIsThinking(false); setScreen("builder");
  };
  const resumeDraft = () => { setScreen("builder"); setActiveArtifact(currentArtifactFor(stage)); };
  const advance = (next: Stage, label?: string, value?: string) => {
    if (label && value) setAnswers((old) => [...old.filter((a) => a.label !== label), { label, value }]);
    if (next === "question" && !choice) setChoice(TESTER_CHOICE);
    if (next === "details" && !details.length) setDetails(TESTER_DETAILS);
    if (next === "style" && !selectedStyle) setSelectedStyle(TESTER_STYLE);
    if (next === "characters") {
      if (!leadName) setLeadName(TESTER_LEAD);
      if (!supportRoles.length) setSupportRoles(TESTER_SUPPORT);
    }
    setIsThinking(true); window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => { setStage(next); setActiveArtifact(currentArtifactFor(next)); setIsThinking(false); }, 1100);
  };
  const toggle = (value: string, current: string[], setter: (values: string[]) => void) => setter(current.includes(value) ? current.filter((item) => item !== value) : [...current, value]);
  const generate = () => {
    setStage("generating"); setActiveArtifact("pages");
    window.setTimeout(() => { setStage("ready"); setActiveArtifact("pages"); }, 1900);
  };

  return <div className={cn("min-h-screen bg-[#f5f6f4] text-[#24302e]", screen === "builder" && "h-screen overflow-hidden")}>
    <AppSidebar screen={screen} mobileOpen={mobileNav} onClose={() => setMobileNav(false)} onDashboard={() => { setScreen("dashboard"); setMobileNav(false); }} />
    <div className={cn("min-h-screen lg:pl-[236px]", screen === "builder" && "h-screen overflow-hidden")}>
      <Topbar screen={screen} onMenu={() => setMobileNav(true)} onDashboard={() => setScreen("dashboard")} />
      {screen === "dashboard" ? <Dashboard hasDraft={Boolean(storyline)} stage={stage} onNew={resetNew} onResume={resumeDraft} /> :
        <Builder
          stage={stage} storyline={storyline} choice={choice} details={details} customDetail={customDetail}
          selectedStyle={selectedStyle} leadName={leadName} supportRoles={supportRoles} answers={answers}
          confirmedPages={confirmedPages} activeArtifact={activeArtifact} isThinking={isThinking}
          artifactPanelOpen={artifactPanelOpen} setArtifactPanelOpen={setArtifactPanelOpen}
          setStoryline={setStoryline} setChoice={setChoice} setDetails={setDetails} setCustomDetail={setCustomDetail}
          setSelectedStyle={setSelectedStyle} setLeadName={setLeadName} setSupportRoles={setSupportRoles}
          setConfirmedPages={setConfirmedPages} setActiveArtifact={setActiveArtifact}
          loadMiloDemo={() => setStoryline(TESTER_STORY)}
          advance={advance} generate={generate} toggle={toggle}
        />}
    </div>
  </div>;
}

function AppSidebar({ screen, mobileOpen, onClose, onDashboard }: { screen: Screen; mobileOpen: boolean; onClose: () => void; onDashboard: () => void }) {
  return <>
    {mobileOpen && <button className="fixed inset-0 z-40 bg-black/30 lg:hidden" onClick={onClose} aria-label="Close navigation" />}
    <aside className={cn("fixed inset-y-0 left-0 z-50 flex w-[236px] flex-col border-r border-[#e3e7e3] bg-[#fbfcfa] transition-transform lg:translate-x-0", mobileOpen ? "translate-x-0" : "-translate-x-full")}>
      <div className="flex h-16 items-center justify-between border-b border-[#e8ebe7] px-4"><button onClick={onDashboard} className="flex items-center gap-2.5"><span className="grid size-9 place-items-center rounded-xl bg-[#205f5b] text-white"><Feather className="size-4"/></span><span className="font-display text-lg font-bold tracking-tight text-[#213a37]">Kid Comics</span></button><Button onClick={onClose} variant="ghost" size="icon" className="lg:hidden"><X className="size-4"/></Button></div>
      <nav className="flex-1 space-y-6 px-3 py-5">
        <NavGroup label="Workspace">
          <NavItem icon={Home} label="Home" active={screen === "dashboard"} onClick={onDashboard}/>
          <NavItem icon={BookOpen} label="Booklets" count="1" active={screen === "builder"}/>
          <NavItem icon={Library} label="Asset library"/>
        </NavGroup>
        <NavGroup label="Tools">
          <NavItem icon={Boxes} label="Style inventory"/>
          <NavItem icon={Users} label="Characters"/>
        </NavGroup>
      </nav>
      <div className="space-y-1 border-t border-[#e8ebe7] p-3"><NavItem icon={CircleHelp} label="Help & feedback"/><NavItem icon={Settings} label="Settings"/><div className="mt-3 flex items-center gap-3 rounded-xl bg-[#f0f3ef] p-2.5"><span className="grid size-8 place-items-center rounded-full bg-[#d9e8e4] text-xs font-bold text-[#205f5b]">AY</span><div className="min-w-0"><p className="truncate text-xs font-semibold">Ali Yeganeh</p><p className="text-[11px] text-[#79817d]">Prototype workspace</p></div><MoreHorizontal className="ml-auto size-4 text-[#77807c]"/></div></div>
    </aside>
  </>;
}
function NavGroup({ label, children }: { label: string; children: React.ReactNode }) { return <div><p className="mb-2 px-3 text-[10px] font-bold uppercase tracking-[.14em] text-[#9aa09d]">{label}</p><div className="space-y-1">{children}</div></div>; }
function NavItem({ icon: Icon, label, count, active, onClick }: { icon: React.ElementType; label: string; count?: string; active?: boolean; onClick?: () => void }) { return <button onClick={onClick} className={cn("flex h-10 w-full items-center gap-3 rounded-xl px-3 text-sm font-medium transition", active ? "bg-[#e4efec] text-[#1d5e59]" : "text-[#5e6864] hover:bg-[#f0f3ef] hover:text-[#24302e]")}><Icon className="size-[17px]"/><span>{label}</span>{count && <span className="ml-auto rounded-full bg-white px-2 py-0.5 text-[10px] text-[#6f7874]">{count}</span>}</button>; }

function Topbar({ screen, onMenu, onDashboard }: { screen: Screen; onMenu: () => void; onDashboard: () => void }) {
  return <header className="sticky top-0 z-30 flex h-16 items-center border-b border-[#e0e5e1] bg-white/95 px-4 backdrop-blur sm:px-6"><Button onClick={onMenu} variant="ghost" size="icon" className="mr-2 lg:hidden"><Menu className="size-5"/></Button>{screen === "dashboard" ? <div><h1 className="text-sm font-semibold">Booklets</h1><p className="text-xs text-[#7b837f]">Create and manage your stories</p></div> : <button onClick={onDashboard} className="flex items-center gap-2 text-sm text-[#68726e] hover:text-[#205f5b]"><ArrowLeft className="size-4"/> All booklets</button>}<div className="ml-auto flex items-center gap-2"><div className="relative hidden md:block"><Search className="absolute left-3 top-2.5 size-4 text-[#89918d]"/><Input className="h-9 w-64 bg-[#f7f8f6] pl-9" placeholder="Search booklets and assets"/></div><Button variant="ghost" size="icon"><Bell className="size-[18px]"/></Button><span className="grid size-8 place-items-center rounded-full bg-[#214f4b] text-[11px] font-bold text-white">AY</span></div></header>;
}

function Dashboard({ hasDraft, stage, onNew, onResume }: { hasDraft: boolean; stage: Stage; onNew: () => void; onResume: () => void }) {
  return <main className="mx-auto max-w-[1440px] p-4 sm:p-6 lg:p-8">
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-sm font-medium text-[#6f7874]">Welcome back</p><h2 className="mt-1 text-2xl font-bold tracking-tight text-[#263330]">Your booklet workspace</h2><p className="mt-1 text-sm text-[#76807b]">Start a new story or continue reviewing a draft.</p></div><Button onClick={onNew}><Plus className="size-4"/> Create booklet</Button></div>
    <div className="mt-7 grid gap-3 sm:grid-cols-3"><Metric icon={Clock3} label="In progress" value={hasDraft && stage !== "ready" ? "1" : "0"}/><Metric icon={Sparkles} label="Generating" value={stage === "generating" ? "1" : "0"}/><Metric icon={CheckCircle2} label="Ready" value="1"/></div>
    <section className="mt-8"><div className="mb-3 flex items-center justify-between"><h3 className="text-sm font-semibold">Recent booklets</h3><button className="text-xs font-semibold text-[#24645e]">View all</button></div><div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {hasDraft && <ProjectCard title={stage === "story" ? "Untitled booklet" : "Milo the Village Postcat"} status={stage === "ready" ? "Ready" : "In progress"} meta="Last edited just now" progress={Math.max(8, Math.round((stageIndex(stage) / (flow.length - 1)) * 100))} onClick={onResume}/>} 
      <ProjectCard title="Milo the Village Postcat" image="./assets/milo-cover.png" status="Ready" meta="6 pages · Updated Jul 18" progress={100}/>
      <button onClick={onNew} className="grid min-h-56 place-items-center rounded-2xl border border-dashed border-[#cfd6d1] bg-white text-center transition hover:border-[#6b9c96] hover:bg-[#f9fbf9]"><div><span className="mx-auto grid size-11 place-items-center rounded-full bg-[#e6efec] text-[#24645e]"><Plus className="size-5"/></span><p className="mt-3 text-sm font-semibold">Create a new booklet</p><p className="mt-1 text-xs text-[#7d8581]">Start from a story idea</p></div></button>
    </div></section>
  </main>;
}
function Metric({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: string }) { return <Card className="border-[#e2e7e2] shadow-none"><CardContent className="flex items-center gap-3 p-4"><span className="grid size-9 place-items-center rounded-xl bg-[#edf3f0] text-[#28645f]"><Icon className="size-[17px]"/></span><div><p className="text-xs text-[#76807b]">{label}</p><p className="text-xl font-bold">{value}</p></div></CardContent></Card>; }
function ProjectCard({ title, image, status, meta, progress, onClick }: { title: string; image?: string; status: string; meta: string; progress: number; onClick?: () => void }) { return <button onClick={onClick} className="overflow-hidden rounded-2xl border border-[#dfe5e0] bg-white text-left shadow-[0_3px_14px_rgba(32,52,47,.04)] transition hover:-translate-y-0.5 hover:shadow-[0_10px_28px_rgba(32,52,47,.09)]"><div className="relative h-36 bg-[#e8ece8]">{image ? <img src={image} className="h-full w-full object-cover" alt=""/> : <div className="grid h-full place-items-center"><BookImage className="size-8 text-[#9aa9a4]"/></div>}<span className={cn("absolute right-3 top-3 rounded-full px-2.5 py-1 text-[10px] font-bold", status === "Ready" ? "bg-[#e3f3e6] text-[#397446]" : "bg-[#fff1dc] text-[#956022]")}>{status}</span></div><div className="p-4"><div className="flex items-start justify-between gap-3"><div><p className="font-semibold">{title}</p><p className="mt-1 text-xs text-[#7a837f]">{meta}</p></div><MoreHorizontal className="size-4 text-[#89918d]"/></div><div className="mt-4 flex items-center gap-2"><div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[#edf0ed]"><div className="h-full rounded-full bg-[#367870]" style={{ width: `${progress}%` }}/></div><span className="text-[10px] font-semibold text-[#737d78]">{progress}%</span></div></div></button>; }

type BuilderProps = {
  stage: Stage; storyline: string; choice: string; details: string[]; customDetail: string; selectedStyle: string; leadName: string; supportRoles: string[]; answers: Answer[]; confirmedPages: string[]; activeArtifact: string; isThinking: boolean; artifactPanelOpen: boolean;
  setArtifactPanelOpen: (v: boolean) => void; setStoryline: (v: string) => void; setChoice: (v: string) => void; setDetails: (v: string[]) => void; setCustomDetail: (v: string) => void; setSelectedStyle: (v: string) => void; setLeadName: (v: string) => void; setSupportRoles: (v: string[]) => void; setConfirmedPages: (v: string[]) => void; setActiveArtifact: (v: string) => void; advance: (next: Stage, label?: string, value?: string) => void; generate: () => void; toggle: (v: string, current: string[], setter: (values: string[]) => void) => void;
  loadMiloDemo: () => void;
};

function Builder(props: BuilderProps) {
  const progress = Math.max(6, Math.round((stageIndex(props.stage) / (flow.length - 1)) * 100));
  const hasSubmittedStory = props.answers.some((answer) => answer.label === "Storyline");
  return <main className="h-[calc(100vh-64px)] overflow-hidden">
    <div className="flex h-[76px] items-center border-b border-[#e0e5e1] bg-white px-4 sm:px-6"><div className="min-w-0"><div className="flex items-center gap-2"><h1 className="truncate text-base font-semibold">{hasSubmittedStory ? "Milo the Village Postcat" : "New booklet"}</h1><span className="rounded-full bg-[#fff2dd] px-2 py-0.5 text-[10px] font-bold text-[#936025]">Draft</span></div><p className="mt-1 text-xs text-[#7a837f]">Autosaved · {props.confirmedPages.length} of 6 pages confirmed</p></div><Button variant="outline" size="sm" className="ml-auto xl:hidden" onClick={() => props.setArtifactPanelOpen(true)}><FolderOpen className="size-4"/> Artifacts</Button><div className="ml-auto hidden w-44 items-center gap-2 xl:flex"><div className="h-1.5 flex-1 rounded-full bg-[#edf0ed]"><div className="h-full rounded-full bg-[#34776f]" style={{ width: `${progress}%` }}/></div><span className="text-xs font-semibold">{progress}%</span></div><Button variant="outline" size="sm" className="ml-3"><MoreHorizontal className="size-4"/></Button></div>
    <div className="grid h-[calc(100%-76px)] grid-cols-1 xl:grid-cols-[380px_240px_minmax(0,1fr)]">
      <Conversation {...props}/>
      <ArtifactRail {...props}/>
      <ArtifactInspector {...props}/>
    </div>
  </main>;
}

function artifactStatus(id: string, stage: Stage, confirmedPages: string[]): ArtifactStatus {
  const idx = stageIndex(stage);
  if (id === "storyline") return idx > 0 ? "confirmed" : "draft";
  if (id === "plot") return idx > 3 ? "confirmed" : idx >= 1 ? "review" : "locked";
  if (id === "style") return idx > 4 ? "confirmed" : idx === 4 ? "review" : "locked";
  if (id === "cast") return idx > 5 ? "confirmed" : idx === 5 ? "review" : "locked";
  if (id === "references" || id === "character-sheet") return idx > 6 ? "confirmed" : idx === 6 ? "review" : "locked";
  if (id === "specs") return idx >= 7 ? "review" : "locked";
  if (id === "pages") return stage === "generating" ? "generating" : stage === "ready" ? "confirmed" : idx >= 7 ? "review" : "locked";
  if (id.startsWith("page-")) return confirmedPages.includes(id) ? "confirmed" : idx >= 7 ? "review" : "locked";
  if (id === "cover") return confirmedPages.includes(id) ? "confirmed" : idx >= 7 ? "review" : "locked";
  return "locked";
}
function currentArtifactFor(stage: Stage) { return ({ story: "", question: "storyline", details: "storyline", plot: "plot", style: "plot", characters: "style", sheet: "cast", review: "pages", generating: "pages", ready: "pages" } as Record<Stage, string>)[stage]; }

function ArtifactRail(props: BuilderProps) {
  const idx = stageIndex(props.stage);
  const groups: [string, [string, string, React.ElementType][]][] = [];
  const storyItems: [string, string, React.ElementType][] = [];
  const visualItems: [string, string, React.ElementType][] = [];
  const bookItems: [string, string, React.ElementType][] = [];
  if (idx > 0) storyItems.push(["storyline", "Storyline", FileText]);
  if (idx >= 3) storyItems.push(["plot", "Plot", GalleryVerticalEnd]);
  if (idx > 4) visualItems.push(["style", "Visual style", Paintbrush]);
  if (idx >= 6) visualItems.push(["cast", "Character cards", Users], ["references", "Character references", UserRound], ["character-sheet", "Character sheet", Image]);
  if (idx >= 7) {
    bookItems.push(["specs", "Booklet specifications", PanelTop], ["pages", "All pages", LayoutGrid]);
    pages.forEach(([id, label]) => bookItems.push([id, label, FileText]));
  }
  if (storyItems.length) groups.push(["Story", storyItems]);
  if (visualItems.length) groups.push(["Visual direction", visualItems]);
  if (bookItems.length) groups.push(["Book structure", bookItems]);
  const content = <div className="flex h-full flex-col bg-[#fafbf9]"><div className="flex h-12 items-center justify-between border-b border-[#e4e8e4] px-4"><div><p className="text-xs font-bold uppercase tracking-[.12em] text-[#7c8581]">Artifacts</p><p className="mt-0.5 text-[10px] text-[#98a09c]">{groups.reduce((sum, [,items]) => sum + items.length, 0)} created</p></div><Button variant="ghost" size="icon" className="xl:hidden" onClick={() => props.setArtifactPanelOpen(false)}><X className="size-4"/></Button></div><div className="flex-1 overflow-y-auto px-2 py-3">{groups.length ? groups.map(([group, items]) => <div key={group} className="mb-5"><p className="mb-1.5 px-2 text-[10px] font-bold uppercase tracking-[.12em] text-[#a0a6a3]">{group}</p>{items.map(([id, label, Icon]) => { const status = artifactStatus(id, props.stage, props.confirmedPages); return <button key={id} onClick={() => { props.setActiveArtifact(id); props.setArtifactPanelOpen(false); }} className={cn("flex min-h-10 w-full items-center gap-2 rounded-lg px-2 text-left text-xs font-medium", props.activeArtifact === id ? "bg-white text-[#1e5d58] shadow-sm ring-1 ring-[#dce5e1]" : "text-[#5d6763] hover:bg-white")}><Icon className="size-3.5 shrink-0"/><span className="truncate">{label}</span><StatusDot status={status}/></button>})}</div>) : <div className="grid h-64 place-items-center px-4 text-center"><div><span className="mx-auto grid size-10 place-items-center rounded-xl bg-[#edf2ef] text-[#7e8c87]"><Boxes className="size-4"/></span><p className="mt-3 text-xs font-semibold">No artifacts yet</p><p className="mt-1 text-[11px] leading-4 text-[#8a938f]">Artifacts will appear here as the agent creates them with you.</p></div></div>}</div><div className="border-t border-[#e4e8e4] p-3"><p className="text-[11px] leading-4 text-[#77827d]">The list grows as the agent produces reviewable work.</p></div></div>;
  return <><aside className="hidden border-r border-[#e0e5e1] xl:block">{content}</aside>{props.artifactPanelOpen && <><button className="fixed inset-0 z-40 bg-black/25 xl:hidden" onClick={() => props.setArtifactPanelOpen(false)}/><aside className="fixed inset-y-0 left-0 z-50 w-[280px] border-r border-[#e0e5e1] xl:hidden">{content}</aside></>}</>;
}
function StatusDot({ status }: { status: ArtifactStatus }) { return <span className="ml-auto">{status === "confirmed" ? <CheckCircle2 className="size-3.5 text-[#4b9560]"/> : status === "locked" ? <LockKeyhole className="size-3 text-[#aab0ad]"/> : status === "generating" ? <RefreshCw className="size-3.5 animate-spin text-[#ba7837]"/> : <span className={cn("block size-2 rounded-full", status === "review" ? "bg-[#dd8a47]" : "bg-[#a8afac]")}/>}</span>; }

function Conversation(props: BuilderProps) {
  const drawerVisible = props.stage !== "story" || props.isThinking;
  return <section className="relative flex min-h-0 min-w-0 flex-col border-r border-[#e0e5e1] bg-white"><div className="flex h-12 shrink-0 items-center justify-between border-b border-[#e5e9e5] px-4"><div className="flex items-center gap-2"><span className="grid size-7 place-items-center rounded-lg bg-[#dfeeea] text-[#21605b]"><Stars className="size-3.5"/></span><div><p className="text-xs font-semibold">Story agent</p><p className="text-[10px] text-[#81908a]">Chat thread</p></div></div><Button variant="ghost" size="icon"><MoreHorizontal className="size-4"/></Button></div><div className={cn("min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain px-4 pt-6 sm:px-5", drawerVisible ? "pb-[380px]" : "pb-24")}><AgentMessage stage={props.stage}/>{props.answers.map((answer) => <div key={answer.label} className="ml-auto max-w-[86%] rounded-2xl rounded-br-md bg-[#245f5a] px-4 py-3 text-sm text-white"><p className="text-[10px] font-bold uppercase tracking-wide text-white/60">{answer.label}</p><p className="mt-1 leading-5">{answer.value}</p></div>)}</div><BaseMessageComposer props={props}/>{drawerVisible && <div data-testid="genui-drawer" role="region" aria-label="Story agent inquiry" className="absolute inset-x-0 bottom-0 z-20 flex max-h-[calc(100%-8px)] min-h-0 flex-col overflow-y-auto overscroll-contain rounded-t-2xl border-t border-[#cfd9d4] bg-white p-3 shadow-[0_-16px_45px_rgba(28,50,44,.16)] [scrollbar-gutter:stable] [-webkit-overflow-scrolling:touch] sm:max-h-[82%]"><div className="mx-auto mb-2 h-1 w-10 shrink-0 rounded-full bg-[#d4dbd7]"/><GenUIComposer {...props}/></div>}</section>;
}
function BaseMessageComposer({ props }: { props: BuilderProps }) {
  return <div className="absolute inset-x-0 bottom-0 z-10 border-t border-[#e1e6e2] bg-white p-3">{props.stage === "story" && <div className="mb-2 flex items-center justify-between gap-2 px-1"><p className="text-[10px] leading-4 text-[#75807b]">Start with an empty idea, or load the guided Milo demo.</p><button type="button" onClick={props.loadMiloDemo} className="shrink-0 rounded-full border border-[#cfe0db] bg-[#eef5f2] px-2.5 py-1 text-[10px] font-bold text-[#24645e] hover:bg-[#e2efeb]">{props.storyline === TESTER_STORY ? "Milo idea loaded" : "Use Milo demo idea"}</button></div>}<div className="flex items-end gap-2 rounded-2xl border border-[#d8dfdb] bg-[#fbfcfa] p-2"><Textarea value={props.stage === "story" ? props.storyline : ""} onChange={(e) => props.setStoryline(e.target.value)} disabled={props.stage !== "story"} placeholder={props.stage === "story" ? "Describe the booklet you want to create…" : "Complete the open inquiry to continue"} className="min-h-10 border-0 bg-transparent p-1.5 text-sm shadow-none focus:ring-0"/><Button size="icon" aria-label="Send message" disabled={props.stage !== "story" || !props.storyline.trim()} onClick={() => props.advance("question", "Storyline", props.storyline)}><Send className="size-4"/></Button></div></div>;
}
function AgentMessage({ stage }: { stage: Stage }) { const copy: Record<Stage, [string, string]> = {
  story: ["What booklet should we create?", "Start with any rough idea. For this prototype, the Milo shortcut loads the demo premise—but nothing is created until you choose and send it."],
  question: ["Let’s confirm Milo’s discovery.", "Choose what the tiny unaddressed letter should reveal at the end of the story."],
  details: ["Let’s tune the story heart.", "Pick the ingredients that should guide Milo’s mystery and its emotional payoff."],
  plot: ["The full plot is ready to review.", "I used your idea and answers to create a beginning, turning point, and ending."],
  style: ["Choose the book’s visual language.", "These inventory styles fit the tone. Your choice will guide character and page references."],
  characters: ["Confirm Milo’s cast.", "Milo, Bunny, Bear, and Mouse are prefilled from the approved character bible."],
  sheet: ["Character references are ready.", "Review the consistency rules before page planning begins."],
  review: ["Review the page plan.", "Open any page from Artifacts, then confirm each section when it feels right."],
  generating: ["Generating the booklet.", "The confirmed story, references, and page plan are being applied across all six pages."],
  ready: ["The booklet is ready.", "All pages are available from the artifact list for final review."],
}; const [title, body] = copy[stage]; return <div className="flex max-w-2xl gap-3"><span className="grid size-8 shrink-0 place-items-center rounded-xl bg-[#205f5b] text-white"><WandSparkles className="size-3.5"/></span><div><p className="text-sm font-semibold">{title}</p><p className="mt-1 text-sm leading-6 text-[#68736e]">{body}</p></div></div>; }

function GenUIComposer(props: BuilderProps) {
  if (props.isThinking) return <Thinking/>;
  if (props.stage === "story") return <ComposerShell label="Storyline input"><Textarea value={props.storyline} onChange={(e) => props.setStoryline(e.target.value)} placeholder="Describe the booklet you want to create…" className="min-h-20"/><ComposerActions><Button variant="ghost" size="sm"><Mic className="size-4"/> Voice</Button><Button disabled={!props.storyline.trim()} onClick={() => props.advance("question", "Storyline", props.storyline)}>Send idea <Send className="size-4"/></Button></ComposerActions></ComposerShell>;
  if (props.stage === "question") { const choices = [TESTER_CHOICE, "A missing birthday invitation", "A secret map of Poppywick"]; return <ComposerShell label="Single choice"><GenUIGuide text="The approved ending is selected. Change it or continue."/><p className="mb-2 text-xs font-semibold">What does Milo discover about the letter?</p><div className="grid gap-1.5 sm:grid-cols-3">{choices.map((item) => <button key={item} onClick={() => props.setChoice(item)} className={cn("relative rounded-xl border px-3 py-2.5 text-left text-xs font-medium", props.choice === item ? "border-[#34776f] bg-[#e9f3f0] text-[#1f5d58]" : "border-[#dde3df] hover:bg-[#f7f9f7]")}>{item === TESTER_CHOICE && <span className="mb-1 block text-[9px] font-bold uppercase tracking-wide text-[#4a7d77]">Approved story</span>}{item}</button>)}</div><ComposerActions><span className="max-w-[55%] truncate text-[10px] text-[#7b8580]">{props.choice ? `Selected: ${props.choice}` : "Choose one answer"}</span><Button disabled={!props.choice} onClick={() => props.advance("details", "Discovery", props.choice)}>Continue <ArrowRight className="size-4"/></Button></ComposerActions></ComposerShell>; }
  if (props.stage === "details") { const tags = ["Gentle mystery", "Everyday kindness", "Friendship", "Village adventure"]; return <ComposerShell label="Multi-select + optional detail"><GenUIGuide text="The approved story heart is selected. Edit it or continue."/><div className="flex flex-wrap gap-1.5">{tags.map((tag) => <button key={tag} onClick={() => props.toggle(tag, props.details, props.setDetails)} className={cn("rounded-full border px-3 py-1.5 text-xs font-medium", props.details.includes(tag) ? "border-[#34776f] bg-[#e8f2ef] text-[#205f5a]" : "border-[#dfe4e0]")}>{props.details.includes(tag) && <Check className="mr-1 inline size-3"/>}{tag}</button>)}</div><Input className="mt-2 h-9" value={props.customDetail} onChange={(e) => props.setCustomDetail(e.target.value)} placeholder="Optional: add another direction"/><ComposerActions><span className="text-[10px] text-[#7b8580]">{props.details.length} selected</span><Button disabled={!props.details.length && !props.customDetail} onClick={() => props.advance("plot", "Story ingredients", [...props.details, props.customDetail].filter(Boolean).join(", "))}>Build plot <Sparkles className="size-4"/></Button></ComposerActions></ComposerShell>; }
  if (props.stage === "plot") return <ComposerShell label="Artifact confirmation"><div className="rounded-xl bg-[#f4f6f3] p-3 text-xs leading-5 text-[#59645f]"><b>Premise:</b> {props.storyline}<br/><b>Resolution:</b> The character’s journey leads to {props.choice.toLowerCase() || "a meaningful discovery"}.</div><ComposerActions><Button variant="ghost" size="sm" onClick={() => props.setActiveArtifact("plot")}>Open plot artifact</Button><Button onClick={() => props.advance("style", "Plot", "Plot confirmed")}>Confirm plot <Check className="size-4"/></Button></ComposerActions></ComposerShell>;
  if (props.stage === "style") return <ComposerShell label="Visual inventory"><GenUIGuide text="Best match selected. Browse alternatives or confirm."/><div className="flex gap-2 overflow-x-auto pb-1">{styles.map((style) => <button key={style.id} onClick={() => props.setSelectedStyle(style.id)} className={cn("relative w-40 shrink-0 overflow-hidden rounded-xl border text-left", props.selectedStyle === style.id ? "border-[#34776f] ring-2 ring-[#d8e9e5]" : "border-[#dce2de]")}><img src={style.image} className="h-16 w-full object-cover"/>{style.id === TESTER_STYLE && <span className="absolute right-1.5 top-1.5 rounded-full bg-white/90 px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wide text-[#24645e]">Recommended</span>}<p className="p-2 text-[11px] font-semibold">{style.title}</p></button>)}</div><ComposerActions><span className="text-[10px] text-[#7b8580]">Selection updates the artifact preview</span><Button disabled={!props.selectedStyle} onClick={() => props.advance("characters", "Visual style", styles.find((s) => s.id === props.selectedStyle)?.title)}>Confirm style <Check className="size-4"/></Button></ComposerActions></ComposerShell>;
  if (props.stage === "characters") { const roles = ["Bunny", "Bear", "Mouse"]; return <ComposerShell label="Character form"><GenUIGuide text="The approved Poppywick cast is filled in."/><label className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-[#7b8580]">Lead character</label><Input value={props.leadName} onChange={(e) => props.setLeadName(e.target.value)} placeholder="Main character name"/><p className="mb-1 mt-2 text-[10px] font-bold uppercase tracking-wide text-[#7b8580]">Supporting characters</p><div className="grid grid-cols-3 gap-1.5">{roles.map((role) => <button key={role} onClick={() => props.toggle(role, props.supportRoles, props.setSupportRoles)} className={cn("rounded-lg border p-2 text-[11px] font-medium", props.supportRoles.includes(role) ? "border-[#34776f] bg-[#e8f2ef] text-[#205f5a]" : "border-[#dfe4e0]")}>{props.supportRoles.includes(role) && <Check className="mr-1 inline size-3"/>}{role}</button>)}</div><ComposerActions><span className="text-[10px] text-[#7b8580]">Milo + 3 neighbours</span><Button disabled={!props.leadName} onClick={() => props.advance("sheet", "Cast", [props.leadName, ...props.supportRoles].join(", "))}>Create references <Sparkles className="size-4"/></Button></ComposerActions></ComposerShell>; }
  if (props.stage === "sheet") return <ComposerShell label="Generated reference review"><div className="flex items-center gap-3 rounded-xl bg-[#f2f5f2] p-3"><span className="grid size-10 place-items-center rounded-xl bg-[#dceae6] text-[#245f5a]"><UserRound className="size-5"/></span><div><p className="text-xs font-semibold">{props.leadName || "Main character"} reference</p><p className="text-[11px] text-[#75807b]">Silhouette, palette, clothing, and expressions locked</p></div><CheckCircle2 className="ml-auto size-4 text-[#4b9560]"/></div><ComposerActions><Button variant="ghost" size="sm">Request edits</Button><Button onClick={() => props.advance("review", "Character references", "References confirmed")}>Confirm references <Check className="size-4"/></Button></ComposerActions></ComposerShell>;
  if (props.stage === "review") { const allDone = props.confirmedPages.length === pages.length; return <ComposerShell label="Page review status"><div className="flex items-center gap-3"><div className="flex-1"><div className="flex justify-between text-xs"><span className="font-semibold">{props.confirmedPages.length} of {pages.length} pages confirmed</span><span className="text-[#74807b]">Open pages from Artifacts</span></div><div className="mt-2 h-1.5 rounded-full bg-[#e8ece9]"><div className="h-full rounded-full bg-[#34776f]" style={{ width: `${(props.confirmedPages.length/pages.length)*100}%` }}/></div></div>{allDone ? <Button onClick={props.generate}>Generate booklet <Sparkles className="size-4"/></Button> : <Button variant="outline" onClick={() => props.setActiveArtifact(pages.find(([id]) => !props.confirmedPages.includes(id))?.[0] || "cover")}>Next incomplete <ArrowRight className="size-4"/></Button>}</div></ComposerShell>; }
  if (props.stage === "generating") return <Thinking title="Generating booklet" body="Rendering six consistent pages from your approved artifacts."/>;
  return <ComposerShell label="Generation complete"><div className="flex items-center gap-3"><CheckCircle2 className="size-6 text-[#4b9560]"/><div><p className="text-xs font-semibold">All six pages are ready</p><p className="text-[11px] text-[#77817d]">Use the artifact list to review the final booklet.</p></div></div></ComposerShell>;
}
function GenUIGuide({ text }: { text: string }) { return <div className="mb-2 rounded-lg bg-[#eef5f2] px-2.5 py-1.5 text-[10px] leading-4 text-[#55706a]"><span className="font-bold text-[#24645e]">Tester shortcut:</span> {text}</div>; }
function ComposerShell({ label, children }: { label: string; children: React.ReactNode }) { return <div className="rounded-2xl border border-[#d8e0db] bg-white p-3 shadow-[0_10px_35px_rgba(35,62,55,.10)]"><p className="mb-2 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[.12em] text-[#74807b]"><WandSparkles className="size-3 text-[#34776f]"/>{label}</p>{children}</div>; }
function ComposerActions({ children }: { children: React.ReactNode }) { return <div className="sticky bottom-0 z-10 -mx-1 mt-2.5 flex items-center justify-between border-t border-transparent bg-white/95 px-1 pb-0.5 pt-2 backdrop-blur">{children}</div>; }
function Thinking({ title = "Story agent is thinking", body = "Turning your response into the next structured step." }: { title?: string; body?: string }) { return <ComposerShell label="Agent processing"><div className="flex items-center gap-3"><span className="grid size-9 place-items-center rounded-xl bg-[#205f5b] text-white"><Sparkles className="size-4 animate-pulse"/></span><div><p className="text-xs font-semibold">{title}</p><p className="text-[11px] text-[#75807b]">{body}</p></div><span className="ml-auto flex gap-1"><i className="size-1.5 animate-bounce rounded-full bg-[#57918a] [animation-delay:-.2s]"/><i className="size-1.5 animate-bounce rounded-full bg-[#57918a] [animation-delay:-.1s]"/><i className="size-1.5 animate-bounce rounded-full bg-[#57918a]"/></span></div></ComposerShell>; }

function ArtifactInspector(props: BuilderProps) {
  const status = artifactStatus(props.activeArtifact, props.stage, props.confirmedPages);
  const page = pages.find(([id]) => id === props.activeArtifact);
  const style = styles.find((s) => s.id === props.selectedStyle);
  const title = page?.[1] || ({ storyline: "Storyline", plot: "Plot overview", style: "Visual style", cast: "Character cards", references: "Character references", "character-sheet": "Character sheet", specs: "Booklet specifications", pages: "All pages" } as Record<string,string>)[props.activeArtifact] || "Artifact viewer";
  const statusLabel = props.activeArtifact ? status : "Nothing selected";
  return <aside className="hidden min-w-0 flex-col bg-[#f8f9f7] xl:flex"><div className="flex h-12 items-center border-b border-[#e1e6e2] px-4"><div><p className="text-xs font-semibold">{title}</p><p className="text-[10px] capitalize text-[#7d8682]">{statusLabel}</p></div><Button variant="ghost" size="icon" className="ml-auto"><MoreHorizontal className="size-4"/></Button></div><div className="flex-1 overflow-y-auto p-4"><ArtifactBody {...props} status={status} page={page}/></div></aside>;
}
function ArtifactBody(props: BuilderProps & { status: ArtifactStatus; page?: string[] }) {
  if (!props.activeArtifact) return <EmptyArtifact icon={GalleryVerticalEnd} title="No artifact selected" body="Artifacts created by the agent will render here when you select them."/>;
  if (props.status === "locked") return <EmptyArtifact icon={LockKeyhole} title="Not available yet" body="This artifact is still being created by the agent."/>;
  if (props.activeArtifact === "storyline") return <MarkdownArtifact content={`# Milo the Village Postcat

> ${props.storyline || TESTER_STORY}

## Story heart

Milo makes every neighbour feel remembered through small, everyday acts of kindness. The mysterious letter gives Poppywick a way to tell him that those ordinary acts matter.

## Reading experience

- **Audience:** Ages 3–5
- **Format:** One cover and five story pages
- **Tone:** Warm, rhythmic, and gently mysterious
- **Setting:** Poppywick Village on a sunny late-spring day

## Core mystery

Who is waiting for the tiny cream envelope with the red wax seal?`}/>;
  if (props.activeArtifact === "plot") return <MarkdownArtifact content={`# Plot overview

## Premise

${props.storyline || TESTER_STORY}

## Story arc

1. **The familiar route** — Milo delivers birthday wishes, recipes, and hello-from-far-away letters across Poppywick.
2. **The mystery** — One tiny envelope remains. It has no name, no house, and only a round red seal.
3. **The search** — Bunny checks the bakery, Bear checks the garden, and Mouse checks the fountain.
4. **The clue** — A tiny paw print beside the seal matches Milo’s own paw.
5. **The reveal** — The letter thanks Milo for making Poppywick feel like home.

## Resolution

Milo discovers **${props.choice || TESTER_CHOICE}** and understands that his everyday kindness is noticed and loved.`}/>;
  if (props.activeArtifact === "style") { const style = styles.find((s) => s.id === props.selectedStyle); return style ? <><img src={style.image} className="aspect-[5/4] w-full rounded-2xl object-cover"/><InspectorCard label={style.title}><p className="text-sm leading-6 text-[#55605b]">{style.desc}</p></InspectorCard></> : <EmptyArtifact icon={Paintbrush} title="Choose a visual style" body="The selected style and its visual reference will appear here."/>; }
  if (props.activeArtifact === "cast") return <div className="space-y-2"><CharacterArtifact name={props.leadName || "Main character"} role="Lead character" primary/>{props.supportRoles.map((role) => <CharacterArtifact key={role} name={role} role="Supporting role"/>)}</div>;
  if (props.activeArtifact === "references" || props.activeArtifact === "character-sheet") return <><img src="./assets/milo-character-sheet.png" alt="Milo character reference sheet" className="w-full rounded-2xl border border-[#dce3de] bg-white object-contain"/><InspectorCard label="Locked traits"><p className="text-sm leading-6 text-[#55605b]">Warm ginger tabby fur, three russet forehead stripes, leaf-green eyes, navy post cap, cream shirt, and red diagonal satchel.</p></InspectorCard></>;
  if (props.activeArtifact === "specs") return <MarkdownArtifact content={`# Booklet specifications

- **Format:** 10 × 8 inches, landscape
- **Length:** One cover + five story pages
- **Reading age:** Ages 3–5
- **Illustration style:** Luminous painterly storybook
- **Dialogue:** One short speech bubble only when it adds a child-friendly voice
- **Assembly:** Six completed pages bound into one PDF`}/>;
  if (props.activeArtifact === "pages") return <div className="grid grid-cols-2 gap-2">{pages.map(([id,label]) => <button key={id} onClick={() => props.setActiveArtifact(id)} className="rounded-xl border border-[#dfe5e0] bg-white p-3 text-left"><div className="aspect-[5/4] rounded-lg bg-[#e9eeea]"/><div className="mt-2 flex items-center justify-between"><span className="text-xs font-semibold">{label}</span><StatusDot status={artifactStatus(id, props.stage, props.confirmedPages)}/></div></button>)}</div>;
  if (props.page) { const [id, label, description] = props.page; const done = props.confirmedPages.includes(id); return <><div className="aspect-[5/4] rounded-2xl bg-gradient-to-br from-[#dce9e3] via-[#f0e7d8] to-[#efd6b8] p-5"><span className="rounded-full bg-white/80 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-[#5f6c67]">{label} preview</span><div className="mt-14 text-center"><Image className="mx-auto size-8 text-[#7f9790]"/><p className="mt-2 text-xs text-[#63726d]">Illustration placeholder</p></div></div><InspectorCard label="Narrative"><p className="text-sm leading-6 text-[#55605b]">{description}</p></InspectorCard><InspectorCard label="Scene & continuity"><p className="text-sm leading-6 text-[#55605b]">One clear foreground action, a calm text area, and consistent character traits.</p></InspectorCard><Button className="w-full" variant={done ? "outline" : "default"} onClick={() => props.setConfirmedPages(done ? props.confirmedPages.filter((p) => p !== id) : [...props.confirmedPages, id])}>{done ? "Mark incomplete" : "Confirm page"}<Check className="size-4"/></Button></>;
  }
  return <EmptyArtifact icon={FileText} title="Artifact preview" body="Select an available item from the artifact list."/>;
}
function MarkdownArtifact({ content }: { content: string }) {
  return <article className="mx-auto max-w-3xl rounded-2xl border border-[#dfe5e0] bg-white px-6 py-7 shadow-[0_2px_10px_rgba(32,52,47,.03)] sm:px-8 sm:py-9"><ReactMarkdown remarkPlugins={[remarkGfm]} components={{
    h1: ({ children }) => <h1 className="font-display text-2xl font-bold tracking-tight text-[#243633]">{children}</h1>,
    h2: ({ children }) => <h2 className="mb-2 mt-7 border-b border-[#e7ebe8] pb-2 text-xs font-bold uppercase tracking-[.12em] text-[#4d7771]">{children}</h2>,
    p: ({ children }) => <p className="my-3 text-sm leading-7 text-[#53615c]">{children}</p>,
    blockquote: ({ children }) => <blockquote className="my-5 border-l-4 border-[#75a49d] bg-[#eef5f2] px-4 py-2 text-[#315d57]">{children}</blockquote>,
    ul: ({ children }) => <ul className="my-3 list-disc space-y-2 pl-5 text-sm leading-6 text-[#53615c]">{children}</ul>,
    ol: ({ children }) => <ol className="my-3 list-decimal space-y-3 pl-5 text-sm leading-6 text-[#53615c]">{children}</ol>,
    li: ({ children }) => <li className="pl-1">{children}</li>,
    strong: ({ children }) => <strong className="font-semibold text-[#2f4541]">{children}</strong>,
  }}>{content}</ReactMarkdown></article>;
}
function EmptyArtifact({ icon: Icon, title, body }: { icon: React.ElementType; title: string; body: string }) { return <div className="grid min-h-80 place-items-center rounded-2xl border border-dashed border-[#d3dbd5] bg-white p-8 text-center"><div><span className="mx-auto grid size-12 place-items-center rounded-2xl bg-[#edf1ee] text-[#7b8984]"><Icon className="size-5"/></span><p className="mt-3 text-sm font-semibold">{title}</p><p className="mt-1 max-w-56 text-xs leading-5 text-[#79837f]">{body}</p></div></div>; }
function InspectorCard({ label, children }: { label: string; children: React.ReactNode }) { return <div className="mt-3 rounded-2xl border border-[#dfe5e0] bg-white p-4"><p className="mb-2 text-[10px] font-bold uppercase tracking-[.12em] text-[#8b938f]">{label}</p>{children}</div>; }
function CharacterArtifact({ name, role, primary }: { name: string; role: string; primary?: boolean }) { return <div className="flex items-center gap-3 rounded-2xl border border-[#dfe5e0] bg-white p-3"><span className={cn("grid size-11 place-items-center rounded-xl", primary ? "bg-[#dcebe7] text-[#205f5b]" : "bg-[#f0ece4] text-[#7d6a51]")}><UserRound className="size-5"/></span><div><p className="text-sm font-semibold">{name}</p><p className="text-xs text-[#7a847f]">{role}</p></div><ChevronRight className="ml-auto size-4 text-[#8e9793]"/></div>; }
function Spec({ label, value }: { label: string; value: string }) { return <div className="flex items-center justify-between rounded-xl border border-[#dfe5e0] bg-white px-3 py-3"><span className="text-xs text-[#75807b]">{label}</span><span className="text-xs font-semibold">{value}</span></div>; }
