"""Run the ontology filler.

The model is BAF's: fill/llm.py builds one of its wrappers from
BAF_LLM_PROVIDER / BAF_LLM_MODEL and BAF's property store holds the credential.

Two ways in, one flow:

    python agent.py --qualification <id>   fill one qualification and exit
    python agent.py --serve                BAF agent on the A2A platform

The state machine (fill/workflow.py) is the description of the flow and what
BAF's monitoring database records. `run_fill` is the same steps as a function,
which is what a request should call: a state machine is a poor thing to invoke
from an HTTP handler.
"""
import argparse
import json
import sys

from fill import clients
from fill.llm import build_llm, completer
from fill.workflow import MAX_ROUNDS, build_agent, run_fill


def fill_one(qualification_id: str, dry_run: bool = False) -> dict:
    """Draft, review and publish one qualification's extracted document.

    Returns what the run did, so an HTTP caller can report it without parsing
    stdout.
    """
    qualification = clients.qualification(qualification_id)
    terms = clients.vocabularies()

    result = run_fill(
        qualification,
        terms=terms,
        complete=completer(build_llm()),
        publish=(lambda qid, payload: None) if dry_run else clients.publish,
        max_rounds=MAX_ROUNDS,
    )

    for prop, outcome in result.outcomes.items():
        print(
            f"{prop}: {len(outcome.draft.nodes)} nodes, "
            f"{len(outcome.rounds)} round(s), stopped '{outcome.stop}', "
            f"{len(outcome.open_findings)} finding(s) left"
        )
        for finding in outcome.open_findings:
            print(f"    {finding}")
    print(
        f"total: {result.rounds} rounds, {result.calls} LLM calls, "
        f"{result.open_findings} findings published as flags"
    )
    if dry_run:
        print(json.dumps(result.payload, indent=2))
    return {
        "rounds": result.rounds,
        "calls": result.calls,
        "flagged": len(result.payload.get("flags", {})),
        "stops": result.stop_reasons,
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--qualification", help="fill this qualification and exit")
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="draft and review, print the payload, publish nothing",
    )
    parser.add_argument(
        "--serve", action="store_true", help="run as a BAF agent (A2A platform)"
    )
    args = parser.parse_args(argv)

    if args.qualification:
        fill_one(args.qualification, dry_run=args.dry_run)
        return 0
    if args.serve:
        agent = build_agent()
        agent.use_a2a_platform()
        agent.run()
        return 0
    parser.print_help()
    return 2


if __name__ == "__main__":
    sys.exit(main())
