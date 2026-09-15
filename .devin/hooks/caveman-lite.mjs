console.log(
  JSON.stringify({
    hookSpecificOutput: {
      hookEventName: "SessionStart",
      additionalContext:
        'Invoke the "caveman" skill immediately with level "lite". Keep Caveman Lite active for the whole session until the user requests another level or turns it off.',
    },
  }),
);
