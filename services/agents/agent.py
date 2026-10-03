"""Run the ontology filler.

The model is BAF's: fill/baf_llm.py builds one of its wrappers and BAF's
property store holds the credential. Which model: the one the qualification's
project chose on the platform, else BAF_LLM_PROVIDER / BAF_LLM_MODEL from the
environment. The project is read from the qualification itself, never taken from
whoever starts the run, so a run can only spend its own project's key.

Two ways in, one flow:

    python agent.py --qualification <id> --project <pid>
                                           fill one qualification and exit
    python agent.py --serve                BAF agent on the A2A platform

The state machine (fill/workflow.py) is the description of the flow and what
BAF's monitoring database records. `run_fill` is the same steps as a function,
which is what a request should call: a state machine is a poor thing to invoke
from an HTTP handler.
"""
import argparse
import json
import sys

from fill import baf_llm, clients, ledger
from fill.workflow import MAX_ROUNDS, build_agent, run_fill


def fill_one(pid: str, qualification_id: str, dry_run: bool = False) -> dict:
    """Draft, review and publish one qualification's extracted document.

    `pid` only says which project database the card is in (the app's path
    `/p/{pid}/api/qualifications/{id}/extracted`): a card of another project is not
    found there. The model is the one the qualification's own project chose
    (`projectId` in the app's export, which is the database the card was found in),
    or the environment's when the project chose none or the export names no
    project. An export naming a project other than `pid` is refused. The
    qualification is read first, because that is where the project comes from; the
    model is settled before any drafting starts.

    Returns what the run did, so an HTTP caller can report it without parsing
    stdout.
    """
    qualification = clients.qualification(pid, qualification_id)
    project = qualification.get("projectId")
    if project and str(project).lower() != pid.lower():
        raise clients.ServiceError(
            f"qualification {qualification_id} belongs to another project than {pid}"
        )
    config = baf_llm.config_for(project, "card_agent")
    llm = baf_llm.build_llm(config, agent_name="ontology_filler_llm")
    run = ledger.RUN.get()
    if run is not None:                                               # the run's model, on every event
        run["model"] = f"{config.provider}/{config.model}"
    ledger.emit("agent.run_started", "agent_run", run and run.get("run_id"), {"model": f"{config.provider}/{config.model}"})

    terms = clients.vocabularies()

    result = run_fill(
        qualification,
        terms=terms,
        complete=ledger.recording(baf_llm.completer(llm)),
        publish=(lambda qid, payload: None)
        if dry_run
        else (lambda qid, payload: clients.publish(pid, qid, payload)),
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
        "model": f"{config.provider}/{config.model}",
        "project": project,
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--qualification", help="fill this qualification and exit")
    parser.add_argument("--project", help="the pid of the project whose database holds it")
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
        if not args.project:
            parser.error("--qualification needs --project <pid>")
        fill_one(args.project, args.qualification, dry_run=args.dry_run)
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
