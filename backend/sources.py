"""
Curated list of publicly accessible educational URLs from premier
computer science / AI / EdTech sources. Used both to pre-seed
the scraped_content cache at startup and to validate on-demand
scrape requests (only allowlisted domains are scraped).
"""

# Allowlist of domains we will ever scrape from. robots.txt is also
# checked at request time before any HTTP fetch.
ALLOWED_DOMAINS = {
    "ocw.mit.edu",
    "news.mit.edu",
    "web.mit.edu",
    "csail.mit.edu",
    "www.caltech.edu",
    "magazine.caltech.edu",
    "www.cs.cmu.edu",
    "www.cmu.edu",
    "ai.stanford.edu",
    "cs.stanford.edu",
    "online.stanford.edu",
    "news.stanford.edu",
    "www.eecs.berkeley.edu",
    "bair.berkeley.edu",
    "data.berkeley.edu",
    "data.gov",
    "catalog.data.gov",
    "eric.ed.gov",
    "nsf.gov",
    "www.nsf.gov",
    "new.nsf.gov",
}

# Pre-seed catalog. Each entry is grouped under a TOPIC the learner
# can pick. Sources are real public CS/AI/EdTech pages. We grab a
# small text snippet at scrape time and store source URL + institution
# so the quiz UI can cite them per the requirements.
TOPIC_CATALOG = [
    {
        "topic_id": "intro-ai",
        "title": "Introduction to AI",
        "description": "Foundational AI concepts: agents, search, learning.",
        "sources": [
            {
                "url": "https://ocw.mit.edu/courses/6-034-artificial-intelligence-fall-2010/pages/syllabus/",
                "institution": "MIT OpenCourseWare",
            },
            {
                "url": "https://ai.stanford.edu/about/",
                "institution": "Stanford AI Lab",
            },
            {
                "url": "https://bair.berkeley.edu/about.html",
                "institution": "UC Berkeley AI Research (BAIR)",
            },
        ],
    },
    {
        "topic_id": "machine-learning",
        "title": "Machine Learning",
        "description": "Supervised, unsupervised, and reinforcement learning fundamentals.",
        "sources": [
            {
                "url": "https://ocw.mit.edu/courses/6-036-introduction-to-machine-learning-fall-2020/pages/syllabus/",
                "institution": "MIT OpenCourseWare",
            },
            {
                "url": "https://cs.stanford.edu/people/karpathy/convnetjs/",
                "institution": "Stanford Computer Science",
            },
        ],
    },
    {
        "topic_id": "neural-networks",
        "title": "Neural Networks & Deep Learning",
        "description": "Perceptrons, backpropagation, convolutional and transformer models.",
        "sources": [
            {
                "url": "https://ocw.mit.edu/courses/6-s191-introduction-to-deep-learning-january-iap-2020/",
                "institution": "MIT OpenCourseWare",
            },
            {
                "url": "https://cs231n.stanford.edu/",
                "institution": "Stanford CS231n",
            },
        ],
    },
    {
        "topic_id": "algorithms",
        "title": "Algorithms & Data Structures",
        "description": "Sorting, graphs, dynamic programming, complexity.",
        "sources": [
            {
                "url": "https://ocw.mit.edu/courses/6-006-introduction-to-algorithms-spring-2020/",
                "institution": "MIT OpenCourseWare",
            },
            {
                "url": "https://www.cs.cmu.edu/~15451-f23/",
                "institution": "Carnegie Mellon University",
            },
        ],
    },
    {
        "topic_id": "ai-ethics",
        "title": "AI Ethics & Responsible AI",
        "description": "Bias, fairness, privacy, accountability in AI systems.",
        "sources": [
            {
                "url": "https://hai.stanford.edu/policy",
                "institution": "Stanford HAI",
            },
            {
                "url": "https://new.nsf.gov/focus-areas/artificial-intelligence",
                "institution": "U.S. National Science Foundation",
            },
        ],
    },
    {
        "topic_id": "edtech-research",
        "title": "EdTech & Learning Science",
        "description": "Evidence-based research on educational technology and instructional design.",
        "sources": [
            {
                "url": "https://eric.ed.gov/?q=educational+technology",
                "institution": "ERIC — U.S. Department of Education",
            },
            {
                "url": "https://catalog.data.gov/dataset?tags=education",
                "institution": "U.S. data.gov",
            },
        ],
    },
    {
        "topic_id": "robotics",
        "title": "Robotics & Autonomous Systems",
        "description": "Perception, planning, and control for autonomous robots.",
        "sources": [
            {
                "url": "https://www.cs.cmu.edu/~rasc/",
                "institution": "Carnegie Mellon Robotics",
            },
            {
                "url": "https://www.caltech.edu/about/news/category/research-news",
                "institution": "Caltech",
            },
        ],
    },
    {
        "topic_id": "nlp",
        "title": "Natural Language Processing",
        "description": "Language modeling, parsing, machine translation, and LLMs.",
        "sources": [
            {
                "url": "https://web.stanford.edu/~jurafsky/slp3/",
                "institution": "Stanford NLP",
            },
            {
                "url": "https://www.eecs.berkeley.edu/Research/Areas/AI/",
                "institution": "UC Berkeley EECS",
            },
        ],
    },
]


def get_topic(topic_id: str):
    for t in TOPIC_CATALOG:
        if t["topic_id"] == topic_id:
            return t
    return None
