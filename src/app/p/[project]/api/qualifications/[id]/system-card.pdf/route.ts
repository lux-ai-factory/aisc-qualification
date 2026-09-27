// Kept so links handed out before the rename still work. The card is called an
// AI card now, and /ai-card.pdf is the path that says so; this one forwards to
// the same handler rather than 404ing on a bookmark or a saved PDF link.
export { GET } from "../ai-card.pdf/route";
