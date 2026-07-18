"""
Code Without Limits curriculum.

Four modules, eight sub-modules each, per the user's product PDF
("The Right APP_Modules.pdf"). Every sub-module ships with:
  - title + persona-aligned eyebrow
  - 1-2 sentence objective (mobile-friendly read)
  - hand-written lesson body (the textbook page)
  - a build_activity dict: what the learner actually does on their phone
  - prompt_template (only on Module 3 sub-modules) — a fill-in framework
  - sources: 2-3 URL/institution pairs the in-app citation footer renders.
    URLs are drawn from the existing scraper allowlist in sources.py so
    /content/topic endpoints will serve real scraped excerpts.

Everything below is plain data so the API can serve it without any LLM
call — staying inside the platform's 5-prompt/day free budget. The
quiz + Studio agents are still available for learners who want a deeper,
AI-generated explanation grounded in the same source list.
"""

# Shared citation pool — each entry MUST also exist in sources.ALLOWED_DOMAINS
# so the scraper can fetch excerpts. Adding new domains here means updating
# sources.ALLOWED_DOMAINS as well.
CITATIONS = {
    "mit_intro_ai":          {"url": "https://ocw.mit.edu/courses/6-034-artificial-intelligence-fall-2010/pages/syllabus/", "institution": "MIT OpenCourseWare"},
    "mit_intro_dl":          {"url": "https://ocw.mit.edu/courses/6-s191-introduction-to-deep-learning-january-iap-2020/",     "institution": "MIT OpenCourseWare"},
    "mit_intro_algos":       {"url": "https://ocw.mit.edu/courses/6-006-introduction-to-algorithms-spring-2020/",              "institution": "MIT OpenCourseWare"},
    "stanford_ai_lab":       {"url": "https://ai.stanford.edu/about/",                                                          "institution": "Stanford AI Lab"},
    "stanford_cs231n":       {"url": "https://cs231n.stanford.edu/",                                                            "institution": "Stanford CS231n"},
    "stanford_hai_policy":   {"url": "https://hai.stanford.edu/policy",                                                         "institution": "Stanford HAI"},
    "stanford_nlp_book":     {"url": "https://web.stanford.edu/~jurafsky/slp3/",                                                "institution": "Stanford NLP (Jurafsky & Martin)"},
    "berkeley_bair":         {"url": "https://bair.berkeley.edu/about.html",                                                    "institution": "UC Berkeley AI Research (BAIR)"},
    "berkeley_eecs_ai":      {"url": "https://www.eecs.berkeley.edu/Research/Areas/AI/",                                        "institution": "UC Berkeley EECS"},
    "cmu_algos":             {"url": "https://www.cs.cmu.edu/~15451-f23/",                                                      "institution": "Carnegie Mellon University"},
    "nsf_ai":                {"url": "https://new.nsf.gov/focus-areas/artificial-intelligence",                                 "institution": "U.S. National Science Foundation"},
    "eric_edtech":           {"url": "https://eric.ed.gov/?q=educational+technology",                                           "institution": "ERIC — U.S. Department of Education"},
    "data_gov_education":    {"url": "https://catalog.data.gov/dataset?tags=education",                                         "institution": "U.S. data.gov"},
}


# ----------------------------------------------------------------------
# Module 3 prompting frameworks. Surfaced inside Module 3 sub-modules
# and also exposed via GET /api/modules/frameworks for the Studio's
# "Insert template" picker.
# ----------------------------------------------------------------------
PROMPT_FRAMEWORKS = [
    {
        "id": "RTF",
        "name": "RTF — Role · Task · Format",
        "purpose": "Smallest reliable prompt scaffold. Use when you need a short, focused output.",
        "template": (
            "Role: You are <role with relevant expertise>.\n"
            "Task: <single verb-driven task in plain language>.\n"
            "Format: <exact output shape — bullets, JSON, table, paragraph length>."
        ),
        "example": (
            "Role: You are a community health worker in rural Honduras.\n"
            "Task: Explain how to recognize early signs of dehydration in toddlers.\n"
            "Format: 5 short bullet points, no jargon, max 80 words total."
        ),
    },
    {
        "id": "CO-STAR",
        "name": "CO-STAR — Context · Objective · Style · Tone · Audience · Response",
        "purpose": "Production-grade scaffold. Use when ambiguity is costly.",
        "template": (
            "Context: <who, where, what's already known>.\n"
            "Objective: <the concrete outcome you need>.\n"
            "Style: <writing/voice style>.\n"
            "Tone: <warm, formal, urgent, plain…>.\n"
            "Audience: <reading level, language, prior knowledge>.\n"
            "Response: <format, length, sections>."
        ),
        "example": (
            "Context: 14-year-olds in a Brazilian favela learning AI for the first time.\n"
            "Objective: Explain what a 'token' is in plain Portuguese-friendly English.\n"
            "Style: Conversational, with one concrete example.\n"
            "Tone: Encouraging.\n"
            "Audience: 9th-grade reading level.\n"
            "Response: 3 sentences plus one analogy."
        ),
    },
    {
        "id": "ERA",
        "name": "ERA — Expectation · Role · Action",
        "purpose": "Rapid code/task delegation when you already know the output you want.",
        "template": (
            "Expectation: <the exact deliverable you want at the end>.\n"
            "Role: <the expert persona who'd produce it>.\n"
            "Action: <step-by-step instructions to get there>."
        ),
        "example": (
            "Expectation: A single-file HTML page that displays today's date in Haitian Creole.\n"
            "Role: A mobile-first front-end engineer who codes on phones.\n"
            "Action: Write valid HTML5, inline the CSS, use one <script> tag, no external libraries."
        ),
    },
    {
        "id": "RISE",
        "name": "RISE — Role · Input · Steps · Expectation",
        "purpose": "Multi-step workflows where the model must reason before producing output.",
        "template": (
            "Role: <expert persona>.\n"
            "Input: <the raw data / context you're providing>.\n"
            "Steps: <numbered steps the model should follow>.\n"
            "Expectation: <final deliverable format>."
        ),
        "example": (
            "Role: A microenterprise coach.\n"
            "Input: 'I make banana chips and sell them at the market for $0.50 a bag.'\n"
            "Steps: 1) Identify three weak points in the business. 2) Propose one AI-generated asset for each. 3) Estimate revenue lift.\n"
            "Expectation: A 3-row table."
        ),
    },
    {
        "id": "CREATE",
        "name": "CREATE — Character · Request · Examples · Adjustments · Type · Extras",
        "purpose": "Best when you need consistency across many outputs (templates, marketing copy).",
        "template": (
            "Character: <persona>.\n"
            "Request: <the ask>.\n"
            "Examples: <2-3 worked examples>.\n"
            "Adjustments: <what to add, remove, emphasize>.\n"
            "Type: <output format>.\n"
            "Extras: <constraints, tone, length>."
        ),
        "example": (
            "Character: A youth radio host in Appalachia.\n"
            "Request: Write 3 social media captions for a recycling drive.\n"
            "Examples: 'Trash to treasure — Saturday 10 AM.' / 'Bring 5 bottles, get a free pin.'\n"
            "Adjustments: Add a question to engage readers.\n"
            "Type: Plain text, no hashtags.\n"
            "Extras: 80 characters max each."
        ),
    },
    {
        "id": "RSTI",
        "name": "RSTI — Restate · Simplify · Test · Iterate",
        "purpose": "Use when a model is giving the wrong answer. Diagnoses circular logic.",
        "template": (
            "Restate: Ask the model to restate the request in its own words.\n"
            "Simplify: Strip the request to ONE measurable goal.\n"
            "Test: Run a tiny case the model can clearly succeed at.\n"
            "Iterate: Add one constraint at a time until the failure reappears."
        ),
        "example": (
            "Original prompt: 'Build a working calculator app.'\n"
            "Restate: 'You want one HTML file that adds two numbers.' → confirm.\n"
            "Simplify: One input field, one + button, one result line.\n"
            "Test: Verify it shows '4' when entering 2+2.\n"
            "Iterate: Add a second operation, retest, repeat."
        ),
    },
]


# ----------------------------------------------------------------------
# Curriculum data
# ----------------------------------------------------------------------
MODULES = [
    # ------------------------------- Module 1 -------------------------------
    {
        "module_id": "ai-fundamentals",
        "title": "AI Fundamentals",
        "persona": "The First-Principles Architect",
        "tagline": "Demystify AI from rule-based systems to transformers, scaling, and mobile-sized models.",
        "color": "brand",
        "submodules": [
            {
                "id": "1.1",
                "title": "Core Concepts & the Spectrum of AI",
                "objective": "Distinguish AI, Generative AI, and AGI; tell rule-based from learned systems.",
                "lesson": "AI is a family of techniques; Generative AI is a recent sub-branch that creates new artifacts; AGI is a hypothetical system that matches human breadth. The shift from hand-coded rules to learned probabilities is the single biggest jump in AI history, and it's why a phone can now describe a photo it has never seen.",
                "sources": ["mit_intro_ai", "stanford_ai_lab", "nsf_ai"],
            },
            {
                "id": "1.2",
                "title": "The Architecture Shift — from Rules to Probabilities",
                "objective": "Understand why probabilistic models replaced hand-coded expert systems.",
                "lesson": "Expert systems failed when reality outran the rule book. Probabilistic machine-learning models instead estimate likelihoods over enormous datasets, trading certainty for graceful failure under noise. That trade-off is also what lets the same model translate, summarize, and answer questions.",
                "sources": ["mit_intro_ai", "berkeley_bair"],
            },
            {
                "id": "1.3",
                "title": "Transformers & GPT Archetypes",
                "objective": "Read a transformer diagram and explain self-attention in plain language.",
                "lesson": "Transformers process every word in a sequence in parallel, asking 'who is most relevant to whom?' via attention weights. GPT-style models stack this trick dozens of times to generate one token at a time, conditioned on everything written so far.",
                "sources": ["stanford_cs231n", "mit_intro_dl"],
            },
            {
                "id": "1.4",
                "title": "Hardware Scaling & Compute",
                "objective": "Map cost-per-FLOP trends to what a phone can run locally today.",
                "lesson": "Training costs scale super-linearly with model size, but inference cost has fallen ~10× a year on phone-class hardware. That deflation is why a 2-billion-parameter model now fits in your pocket.",
                "sources": ["berkeley_eecs_ai", "nsf_ai"],
            },
            {
                "id": "1.5",
                "title": "Multi-Dimensional Tensors",
                "objective": "Visualize a tensor and connect dimensions to real data (token, batch, layer).",
                "lesson": "A tensor is just a list of numbers with shape. A sentence of 12 tokens × 768 features is a 2-D tensor; batch 32 of them and you've got 3-D. Visualizing the shape is half the debugging.",
                "sources": ["mit_intro_dl", "stanford_cs231n"],
            },
            {
                "id": "1.6",
                "title": "Kaplan vs. Chinchilla Scaling Laws",
                "objective": "Pick the optimal trade-off between parameters, data, and compute for your budget.",
                "lesson": "Kaplan said: bigger model, almost always better. Chinchilla corrected that: feed smaller models far more data and they beat over-sized ones. For low-resource learners, Chinchilla logic is gold — a small, well-fed model is more useful than a giant, under-fed one.",
                "sources": ["berkeley_bair", "stanford_ai_lab"],
            },
            {
                "id": "1.7",
                "title": "Mosaic's Law & Economics",
                "objective": "Project how falling compute prices change what's economically viable.",
                "lesson": "Mosaic's Law observes that compute cost halves every ~18 months. Plan curricula and businesses against that curve, not against today's snapshot.",
                "sources": ["nsf_ai"],
            },
            {
                "id": "1.8",
                "title": "LLMs vs. Small Language Models (SLMs)",
                "objective": "Choose between a giant cloud model and a phone-resident small model for a task.",
                "lesson": "LLMs win on broad world knowledge; SLMs win on cost, latency, privacy, and offline reliability. Most real-world micro-enterprise tasks need an SLM, not GPT-4.",
                "sources": ["berkeley_eecs_ai", "mit_intro_dl"],
            },
        ],
    },

    # ------------------------------- Module 2 -------------------------------
    {
        "module_id": "corpus-stewardship",
        "title": "Corpus Stewardship",
        "persona": "The Cultural Linguist & Ethics Steward",
        "tagline": "Train models on community language with consent, fairness, and sovereignty.",
        "color": "brandSecondary",
        "submodules": [
            {
                "id": "2.1",
                "title": "Knowledge Representation & Logic",
                "objective": "Move from prose to structured facts a machine can reason over.",
                "lesson": "Turn 'Maria sells banana chips at the Saturday market' into triples (subject, predicate, object). Once your knowledge looks like rows of facts, both rules and learning algorithms can use it.",
                "sources": ["eric_edtech", "mit_intro_ai"],
            },
            {
                "id": "2.2",
                "title": "Ontologies for Authentic Speech",
                "objective": "Design a small ontology that respects local dialect, idiom, and metaphor.",
                "lesson": "An ontology is a controlled vocabulary plus the relationships between terms. Build yours from the elders' words first; map to English second.",
                "sources": ["eric_edtech", "data_gov_education"],
            },
            {
                "id": "2.3",
                "title": "The Symbol-Grounding Problem",
                "objective": "Recognize when a model handles symbols without understanding meaning.",
                "lesson": "A model can manipulate the word 'rice' fluently and still fail to know it's edible. Always ground critical terms in real-world examples, photos, or audio.",
                "sources": ["stanford_nlp_book", "stanford_hai_policy"],
            },
            {
                "id": "2.4",
                "title": "Unsupervised Pre-training Patterns",
                "objective": "Explain how raw text becomes a model that 'knows' grammar.",
                "lesson": "Predicting the next token on a billion sentences forces a model to discover syntax, semantics, and even style — entirely without labels. That's where most of a model's 'world knowledge' comes from.",
                "sources": ["stanford_nlp_book", "mit_intro_dl"],
            },
            {
                "id": "2.5",
                "title": "SFT & RLHF Alignment",
                "objective": "Distinguish supervised fine-tuning from preference-based reinforcement learning.",
                "lesson": "SFT teaches a model 'this is the right answer.' RLHF teaches it 'this is the preferred answer.' Combined, they turn raw predictors into safe, conversational assistants.",
                "sources": ["stanford_hai_policy", "berkeley_bair"],
            },
            {
                "id": "2.6",
                "title": "Mitigating Cognitive & Cultural Bias",
                "objective": "Run a simple bias audit on a model's outputs in your community context.",
                "lesson": "Ask the same prompt from three cultural lenses; compare. If the answer changes, the model is mirroring training-set bias. Document it. Adjust prompts or fine-tune to compensate.",
                "sources": ["stanford_hai_policy", "nsf_ai"],
            },
            {
                "id": "2.7",
                "title": "Echo Chambers vs. Hallucinations",
                "objective": "Tell when a model invents facts vs. when it confidently repeats popular falsehoods.",
                "lesson": "Hallucinations are statistical failures; echo chambers are training-data failures. Both look like confident wrong answers; the fix is different for each.",
                "sources": ["stanford_hai_policy", "eric_edtech"],
            },
            {
                "id": "2.8",
                "title": "IP, Attribution, & Data Sovereignty",
                "objective": "Choose a data-sovereignty stance for your community's language data.",
                "lesson": "Decide BEFORE collecting: who owns the dataset, who can train on it, how attribution flows back, and how consent can be revoked. Indigenous Data Sovereignty principles are a strong default.",
                "sources": ["data_gov_education", "nsf_ai"],
            },
        ],
    },

    # ------------------------------- Module 3 -------------------------------
    {
        "module_id": "prompt-efficiency",
        "title": "Prompt Efficiency",
        "persona": "The Cognitive Architect & Token Optimiser",
        "tagline": "Get the right answer in the fewest tokens — built for low-bandwidth contexts.",
        "color": "brand",
        "submodules": [
            {
                "id": "3.1",
                "title": "Shot-Prompting Methodologies",
                "objective": "Pick zero-shot, one-shot, or few-shot for the task at hand.",
                "lesson": "Zero-shot: ask cold. One-shot: show one example. Few-shot: show 2-5. The trade-off is token cost vs. accuracy. For repeat tasks, store your best few-shot prompt and reuse it.",
                "framework": "RTF",
                "sources": ["stanford_nlp_book", "berkeley_bair"],
            },
            {
                "id": "3.2",
                "title": "Self-Consistency & Meta-Prompting",
                "objective": "Have the model audit its own reasoning before producing a final answer.",
                "lesson": "Ask the model 'before you answer, list 3 ways this could be wrong, then pick the strongest.' This single line raises factual accuracy noticeably at zero extra cost.",
                "framework": "CO-STAR",
                "sources": ["stanford_nlp_book"],
            },
            {
                "id": "3.3",
                "title": "The RTF Core Framework",
                "objective": "Write a working RTF prompt in under 30 seconds.",
                "lesson": "Role, Task, Format. Three lines. If a prompt isn't working, you almost always missed one of the three.",
                "framework": "RTF",
                "sources": ["stanford_nlp_book"],
            },
            {
                "id": "3.4",
                "title": "Deep Dive into CO-STAR",
                "objective": "Use CO-STAR when ambiguity will cost you.",
                "lesson": "Add Context, Style, Tone, and Audience on top of RTF. The output goes from 'usable' to 'shippable' because the model now knows who's reading and how it should sound.",
                "framework": "CO-STAR",
                "sources": ["stanford_nlp_book", "stanford_hai_policy"],
            },
            {
                "id": "3.5",
                "title": "Hybrid Frameworks — ERA, RISE, CREATE",
                "objective": "Pick the right framework for code, workflows, or marketing batches.",
                "lesson": "ERA → fast code delegation. RISE → multi-step reasoning. CREATE → consistent batch outputs. Same idea each time: shape your input, shape your output.",
                "framework": "ERA",
                "sources": ["stanford_nlp_book"],
            },
            {
                "id": "3.6",
                "title": "Troubleshooting Prompts — The RSTI Protocol",
                "objective": "Debug a failing prompt by Restating, Simplifying, Testing, Iterating.",
                "lesson": "Most bad outputs come from bad inputs. RSTI is a four-step debugger you can run in your head while waiting for a slow connection.",
                "framework": "RSTI",
                "sources": ["stanford_nlp_book"],
            },
            {
                "id": "3.7",
                "title": "Text-Only Cache-Offline Patterns",
                "objective": "Design one-shot prompts that deliver a full workflow in a single response.",
                "lesson": "When bandwidth is intermittent, ask for the entire week's lesson plan in one reply, not seven follow-ups. Cache it locally. Re-use it offline.",
                "framework": "CREATE",
                "sources": ["mit_intro_ai", "data_gov_education"],
            },
            {
                "id": "3.8",
                "title": "RAG vs. Agents",
                "objective": "Decide whether your problem needs retrieval or a multi-step agent loop.",
                "lesson": "RAG = look up facts in your data, then answer once. Agents = loop, plan, call tools, react. RAG is cheaper and offline-friendlier; agents handle ambiguity better.",
                "framework": "RISE",
                "sources": ["berkeley_bair", "stanford_nlp_book"],
            },
        ],
    },

    # ------------------------------- Module 4 -------------------------------
    {
        "module_id": "microenterprise",
        "title": "Microenterprise & Mobile Coding",
        "persona": "The Antifragile Operator",
        "tagline": "Turn AI assets into local income on a phone — even when the network drops.",
        "color": "brandSecondary",
        "submodules": [
            {
                "id": "4.1",
                "title": "Antifragile Operations Strategy",
                "objective": "Design a business that gets stronger from intermittent power/network.",
                "lesson": "Antifragile ≠ resilient. A resilient business survives shocks; an antifragile one improves from them. Plan for outages, then design the outage to be a feature (cached lessons, offline drafts, async sync).",
                "sources": ["eric_edtech", "data_gov_education"],
            },
            {
                "id": "4.2",
                "title": "Local Data Manipulation Stack",
                "objective": "Read, filter, and join CSVs entirely on your phone.",
                "lesson": "Tabular data is the universal currency of micro-enterprise. Learn to open a CSV, sort it, sum it, and export — all in a single mobile browser tab.",
                "build_activity": {
                    "kind": "html_lab",
                    "title": "Build: tiny CSV viewer",
                    "brief": "Build a single-file HTML page that lets you paste a CSV and see it as a sortable table. Save it to your phone and open it offline.",
                    "starter": (
                        "<!doctype html>\n<html><head><meta charset=\"utf-8\"><title>CSV Viewer</title>\n"
                        "<style>body{font-family:system-ui;padding:16px}textarea{width:100%;height:120px}table{border-collapse:collapse;width:100%}td,th{border:1px solid #ccc;padding:6px}</style></head>\n"
                        "<body>\n  <textarea id=\"csv\">name,age\\nAna,12\\nLuis,14</textarea>\n  <button onclick=\"render()\">Show table</button>\n  <div id=\"out\"></div>\n"
                        "<script>\nfunction render(){\n  const rows = document.getElementById('csv').value.trim().split('\\n').map(r=>r.split(','));\n  document.getElementById('out').innerHTML = '<table>' + rows.map((r,i)=>`<tr>${r.map(c=>`<${i?'td':'th'}>${c}</${i?'td':'th'}>`).join('')}</tr>`).join('') + '</table>';\n}\n</script>\n</body></html>"
                    ),
                },
                "sources": ["mit_intro_algos", "data_gov_education"],
            },
            {
                "id": "4.3",
                "title": "Local Lookup Engineering",
                "objective": "Build a phone-resident index for fast offline search.",
                "lesson": "A simple inverted index (term → list of rows) makes a 10,000-row catalog searchable in milliseconds — no server, no internet.",
                "sources": ["mit_intro_algos", "cmu_algos"],
            },
            {
                "id": "4.4",
                "title": "Cross-Platform Capability Snapshots",
                "objective": "Match model families (Gemini, Llama, Mistral, Phi) to local use-cases.",
                "lesson": "Different families have different strengths: long-context vs. small-footprint vs. multilingual. Keep a one-page snapshot of which you'd reach for in which situation.",
                "sources": ["berkeley_bair", "stanford_ai_lab"],
            },
            {
                "id": "4.5",
                "title": "Local Model Orchestration (Msty Track)",
                "objective": "Run an open-source small model on a phone-class device.",
                "lesson": "On-device runners like Msty / Ollama bundle the weights and the inference engine. Pull a quantized 2B model, run it, and you've got a private offline assistant.",
                "sources": ["berkeley_eecs_ai", "mit_intro_dl"],
            },
            {
                "id": "4.6",
                "title": "Multi-Agent Logic & Crews",
                "objective": "Design two cooperating agents that hand off a task.",
                "lesson": "Specialize: one agent drafts, the other reviews. Pass structured JSON between them; the loop is shorter, the output is steadier.",
                "sources": ["berkeley_bair", "stanford_nlp_book"],
            },
            {
                "id": "4.7",
                "title": "Secure Tool Handovers",
                "objective": "Store secrets safely in a phone-only workflow.",
                "lesson": "Never paste API keys into chat; store them in your device's secure storage. Use a `.env`-style separation between code and secrets.",
                "sources": ["nsf_ai", "data_gov_education"],
            },
            {
                "id": "4.8",
                "title": "Network Resilience Design — Mobile Coding Lab",
                "objective": "Ship a phone-built mini-app as a single HTML/CSS/JS file.",
                "lesson": "The whole app fits in one file you can save to your phone's downloads folder. No server, no build, no internet to run it. localStorage gives you persistence. That's enough to ship.",
                "build_activity": {
                    "kind": "html_lab",
                    "title": "Build: offline-first notes app",
                    "brief": "A learner taps notes into your app; the notes survive when they close the browser. Bonus: add a 'Share via WhatsApp' button.",
                    "starter": (
                        "<!doctype html>\n<html><head><meta charset=\"utf-8\"><title>My Notes</title>\n"
                        "<style>body{font-family:system-ui;padding:16px;background:#F7F5F0}textarea{width:100%;height:140px;font-size:16px;padding:10px;border-radius:12px;border:1px solid #ccc}button{background:#C84C31;color:#fff;border:0;padding:12px 18px;border-radius:999px;margin-top:10px;font-weight:600}</style></head>\n"
                        "<body>\n  <h2>My Notes</h2>\n  <textarea id=\"n\" placeholder=\"Type a note…\"></textarea>\n  <button onclick=\"save()\">Save</button>\n  <div id=\"out\"></div>\n"
                        "<script>\nfunction save(){\n  const list = JSON.parse(localStorage.getItem('notes')||'[]');\n  list.push({t:Date.now(), text: document.getElementById('n').value});\n  localStorage.setItem('notes', JSON.stringify(list));\n  document.getElementById('n').value='';\n  render();\n}\nfunction render(){\n  const list = JSON.parse(localStorage.getItem('notes')||'[]');\n  document.getElementById('out').innerHTML = list.map(n=>`<p>📝 ${n.text}</p>`).join('');\n}\nrender();\n</script>\n</body></html>"
                    ),
                },
                "sources": ["eric_edtech", "mit_intro_algos"],
            },
        ],
    },
]


def find_module(module_id: str):
    for m in MODULES:
        if m["module_id"] == module_id:
            return m
    return None


def find_submodule(module_id: str, sub_id: str):
    m = find_module(module_id)
    if not m:
        return None, None
    for s in m["submodules"]:
        if s["id"] == sub_id:
            return m, s
    return m, None


def attach_citations(submodule: dict) -> dict:
    """Replace the citation keys with full {url, institution} dicts so the
    response can be sent directly to the phone without another lookup."""
    out = dict(submodule)
    out["sources"] = [CITATIONS[k] for k in submodule.get("sources", []) if k in CITATIONS]
    if submodule.get("framework"):
        framework = next((f for f in PROMPT_FRAMEWORKS if f["id"] == submodule["framework"]), None)
        if framework:
            out["framework"] = framework
    return out
