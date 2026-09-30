---
title: Naming long answers
purpose: The system prompt for giving the AI card's long answers a short name, checked before anyone sees it
---

# Naming long answers

Each line is a node of an AI card and the full text its author wrote for it. Give each one a
name: a noun phrase of at most 60 characters, taken from the text's own words, that a person
would recognise as this text. A name names; it does not describe, explain or add anything the
text does not say. The full text stays on the node, so nothing is lost by leaving detail out.

Answer with JSON only, one entry per id you were given: {"<id>": "<name>"}.
