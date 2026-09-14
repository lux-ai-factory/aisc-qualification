// The filler's state machine, as BAF holds it (services/agents/fill/workflow.py).
//
// Inline SVG rather than an image file: it scales, it takes its colours from the
// page's tokens so it matches the rest of the card, and its labels are text a
// screen reader and a search can read.
//
// `review` is the only state with a choice, so the main line runs
// load -> draft -> review -> publish -> done, with `revise` below review in a
// cycle: revise never publishes, it returns to review.
const W = 96;
const H = 46;
const ROW = 40;
const MID = ROW + H / 2;

const MAIN = [
  { id: "load", x: 8, label: "load", note: "form + terms" },
  { id: "draft", x: 128, label: "draft", note: "propose" },
  { id: "review", x: 248, label: "review", note: "controls, critic" },
  { id: "publish", x: 468, label: "publish", note: "write + flags" },
  { id: "done", x: 588, label: "done", note: "record" },
];

const REVISE = { x: 248, y: 130, label: "revise", note: "only what was named" };

function Box({
  x,
  y,
  label,
  note,
  gate = false,
}: {
  x: number;
  y: number;
  label: string;
  note: string;
  gate?: boolean;
}) {
  return (
    <g>
      <rect
        x={x}
        y={y}
        width={W}
        height={H}
        className={
          gate ? "method-diagram-box method-diagram-box--gate" : "method-diagram-box"
        }
      />
      <text x={x + W / 2} y={y + 19} className="method-diagram-label">
        {label}
      </text>
      <text x={x + W / 2} y={y + 34} className="method-diagram-note">
        {note}
      </text>
    </g>
  );
}

export default function BafDiagram() {
  return (
    <svg
      className="method-diagram"
      viewBox="0 0 700 200"
      role="img"
      aria-label="The filler's state machine: load, draft and review run in a line; while a finding is open review goes to revise and revise returns to review; once settled review goes to publish and then done"
    >
      <title>The ontology filler as a BAF state machine</title>
      <desc>
        load hands the form and the term lists to draft, which proposes nodes.
        review runs the deterministic controls and then the critic. While a
        finding is open and a round remains, review passes to revise, and revise
        returns to review. Once settled, or out of rounds, review passes to
        publish, which writes the draft and its flags to the graph. done records
        what the run cost.
      </desc>

      <defs>
        <marker
          id="baf-arrow"
          viewBox="0 0 10 10"
          refX="9"
          refY="5"
          markerWidth="7"
          markerHeight="7"
          orient="auto-start-reverse"
        >
          <path d="M 0 0 L 10 5 L 0 10 z" className="method-diagram-head" />
        </marker>
      </defs>

      {/* load -> draft -> review */}
      {[0, 1].map((i) => (
        <line
          key={`main-${i}`}
          x1={MAIN[i].x + W}
          y1={MID}
          x2={MAIN[i + 1].x - 4}
          y2={MID}
          className="method-diagram-edge"
          markerEnd="url(#baf-arrow)"
        />
      ))}

      {/* review -> publish, the only way out of the loop */}
      <line
        x1={MAIN[2].x + W}
        y1={MID}
        x2={MAIN[3].x - 4}
        y2={MID}
        className="method-diagram-edge"
        markerEnd="url(#baf-arrow)"
      />
      <text x={(MAIN[2].x + W + MAIN[3].x) / 2} y={MID - 14} className="method-diagram-cond">
        settled, or out of rounds
      </text>

      {/* publish -> done */}
      <line
        x1={MAIN[3].x + W}
        y1={MID}
        x2={MAIN[4].x - 4}
        y2={MID}
        className="method-diagram-edge"
        markerEnd="url(#baf-arrow)"
      />

      {/* the cycle: review down to revise, revise back up to review */}
      <line
        x1={REVISE.x + 30}
        y1={ROW + H}
        x2={REVISE.x + 30}
        y2={REVISE.y - 4}
        className="method-diagram-edge method-diagram-edge--loop"
        markerEnd="url(#baf-arrow)"
      />
      <line
        x1={REVISE.x + 66}
        y1={REVISE.y}
        x2={REVISE.x + 66}
        y2={ROW + H + 4}
        className="method-diagram-edge method-diagram-edge--loop"
        markerEnd="url(#baf-arrow)"
      />
      {/* Beside the cycle, not beside the review-to-publish edge: at the old
          position it read as a condition on leaving the loop. */}
      <text x={REVISE.x + W + 72} y={REVISE.y + 22} className="method-diagram-cond">
        while a finding is open,
      </text>
      <text x={REVISE.x + W + 72} y={REVISE.y + 36} className="method-diagram-cond">
        up to three rounds
      </text>

      {MAIN.map((state) => (
        <Box
          key={state.id}
          x={state.x}
          y={ROW}
          label={state.label}
          note={state.note}
          gate={state.id === "review"}
        />
      ))}
      <Box
        x={REVISE.x}
        y={REVISE.y}
        label={REVISE.label}
        note={REVISE.note}
      />
    </svg>
  );
}
