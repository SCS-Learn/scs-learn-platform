export type LessonType = "lesson" | "quiz";

export type LessonItem = {
  id: string;
  code: string;
  title: string;
  type: LessonType;
};

export type Unit = {
  id: string;
  code: string;
  title: string;
  lessons: LessonItem[];
};

export type InstructorCourse = {
  code: string;
  title: string;
  department: string;
  track: string;
  studentCount: number;
  units: Unit[];
};

export const instructorName = "Phillip Compeau";

export const instructorCourses: InstructorCourse[] = [
  {
    code: "02-251",
    title: "Introduction to Bioinformatics",
    department: "Computational Biology",
    track: "Paid track",
    studentCount: 187,
    units: [
      {
        id: "unit-1",
        code: "Unit 1",
        title: "Biological sequences",
        lessons: [
          { id: "1.1", code: "1.1", title: "What a FASTA file really contains", type: "lesson" },
          { id: "1.2", code: "1.2", title: "Quality scores and trimming", type: "lesson" },
          { id: "1.3", code: "1.3", title: "Quiz: sequences and formats", type: "quiz" },
        ],
      },
      {
        id: "unit-2",
        code: "Unit 2",
        title: "Pairwise alignment",
        lessons: [
          { id: "2.1", code: "2.1", title: "Needleman-Wunsch by hand", type: "lesson" },
          { id: "2.2", code: "2.2", title: "Local alignment and gaps", type: "lesson" },
          { id: "2.3", code: "2.3", title: "Quiz: alignment", type: "quiz" },
        ],
      },
      {
        id: "unit-3",
        code: "Unit 3",
        title: "Sequence search",
        lessons: [
          { id: "3.1", code: "3.1", title: "Substitution matrices and BLAST", type: "lesson" },
          { id: "3.2", code: "3.2", title: "Reading an E-value", type: "lesson" },
          { id: "3.3", code: "3.3", title: "Quiz: sequence search", type: "quiz" },
        ],
      },
      {
        id: "unit-4",
        code: "Unit 4",
        title: "Multiple alignment and phylogeny",
        lessons: [],
      },
      {
        id: "unit-6",
        code: "Unit 6",
        title: "RNA-seq and expression",
        lessons: [
          { id: "6.1", code: "6.1", title: "From reads to counts", type: "lesson" },
          { id: "6.2", code: "6.2", title: "Normalisation strategies", type: "lesson" },
          { id: "6.3", code: "6.3", title: "Differential expression", type: "lesson" },
        ],
      },
    ],
  },
  {
    code: "02-450",
    title: "Computational Genomics",
    department: "Computational Biology",
    track: "Cohort",
    studentCount: 0,
    units: [],
  },
];

export const lessonTypeOptions = ["Content", "Quiz"];

export type Attachment = {
  id: string;
  name: string;
};

export const initialAttachments: Attachment[] = [
  { id: "att-1", name: "lecture-14-rnaseq.pdf" },
  { id: "att-2", name: "counts-matrix.tsv" },
];

export const initialLessonContent = `
  <h3>Counts are not expression</h3>
  <p>A gene with twice the reads is not twice as expressed. Library depth and transcript length both scale raw counts, and biological replicates vary more than sampling alone predicts. Normalise for the first two, then model the third with a dispersion parameter.</p>
  <pre><code>dds &lt;- DESeqDataSetFromMatrix(counts, meta, ~ batch + genotype)
dds &lt;- DESeq(dds)
res &lt;- results(dds, alpha = 0.05)</code></pre>
  <p>Ask them to predict the number of DE genes before running it. The prediction is what makes the result stick.</p>
  <ul>
    <li>TPM makes samples comparable; raw counts never are.</li>
    <li>Poisson describes sampling; replicates need dispersion.</li>
  </ul>
`;

export type Announcement = {
  id: string;
  authorName: string;
  authorInitials: string;
  courseCode: string;
  timestamp: string;
  message: string;
};

export const initialAnnouncements: Announcement[] = [
  {
    id: "ann-1",
    authorName: "Phillip Compeau",
    authorInitials: "PC",
    courseCode: "02-251",
    timestamp: "12 minutes ago",
    message: "The counts matrix for exercise 6.5 is posted. Column names are sample IDs, not conditions.",
  },
  {
    id: "ann-2",
    authorName: "Marcus Chen",
    authorInitials: "MC",
    courseCode: "02-251",
    timestamp: "Yesterday",
    message: "Quizzes now take unlimited attempts. Keep going until every answer is right.",
  },
];

export type CalendarEventType = "live-talk" | "office-hours" | "new-unit" | "cohort-launch";

export type CalendarEvent = {
  id: string;
  day: number;
  weekday: string;
  label: string;
  type: CalendarEventType;
  time: string;
  description: string;
};

export const calendarMonthLabel = "July 2026";

export const calendarWeekStrip = [
  { day: 27, weekday: "M", hasEvent: false, dimmed: false },
  { day: 28, weekday: "T", hasEvent: true, dimmed: false },
  { day: 29, weekday: "W", hasEvent: false, dimmed: false },
  { day: 30, weekday: "T", hasEvent: true, dimmed: false },
  { day: 31, weekday: "F", hasEvent: true, dimmed: false },
  { day: 1, weekday: "S", hasEvent: false, dimmed: true },
  { day: 2, weekday: "S", hasEvent: false, dimmed: true },
];

export const calendarEvents: CalendarEvent[] = [
  {
    id: "evt-1",
    day: 28,
    weekday: "TUE",
    label: "Why your DE gene list is mostly noise",
    type: "live-talk",
    time: "5:00–6:00pm ET",
    description: "Phillip Compeau · Zoom",
  },
  {
    id: "evt-2",
    day: 30,
    weekday: "THU",
    label: "Exercise 6.5 help, two TAs",
    type: "office-hours",
    time: "3:00–5:00pm ET",
    description: "Discord voice",
  },
  {
    id: "evt-3",
    day: 31,
    weekday: "FRI",
    label: "Unit 7 — Protein structure opens",
    type: "new-unit",
    time: "",
    description: "No deadlines. Open it when you are ready.",
  },
  {
    id: "evt-4",
    day: 17,
    weekday: "MON",
    label: "02-450 Computational Genomics opens",
    type: "cohort-launch",
    time: "",
    description: "Enrollment opens Aug 3 · 12 weeks",
  },
];
