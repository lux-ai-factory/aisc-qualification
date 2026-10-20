// The answered form read top to bottom, every part in order, so a test can look
// at the whole card at once. The card page shows one part at a time.
import { Fragment } from "react";

import {
  answeredFormParts,
  type AnsweredFormProps,
} from "@/app/p/[project]/qualify/[id]/AnsweredForm";

export default function AnsweredForm(props: AnsweredFormProps) {
  return (
    <div className="qf-read">
      {answeredFormParts(props).map((part) => (
        <Fragment key={part.id}>{part.content}</Fragment>
      ))}
    </div>
  );
}
