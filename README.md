# hud

A minimal, modern HUD for Claude Code. It sits on the hint line under the prompt and shows,
at a glance:

- **Model** in use and the **effort** level the main conversation is actually sending
- **Context** fill as a percentage, with tokens used over the window (`ctx 12% 122k/1.0M`)
- **Rate limits** for the 5-hour window (with a reset countdown) and the 7-day window
- **Session cost** in US dollars

```
⏵⏵ auto mode on (shift+tab to cycle)     ◆ opus 5.5 · effort high · ctx 12% 122k/1.0M · 5h 31% ↻ 3h21m · 7d 40% · $2.09
```

Percentages turn amber at 60% and red at 85%, in your theme's own colors. Claude Code's
own hint line stays on the left, untouched. On a narrow terminal the least important parts
drop out first (token counts, 7d, effort, model, cost, then 5h); the context figure always
stays. Rate limits show only on a Claude subscription, after the first response.

Type `/hud` to hide it, and `/hud` again to bring it back.

## Install

At the prompt of a Claude Code terminal session:

```
/plugin install hud --marketplace iamsreeharims/hud
```

Answer `y` to add the marketplace, then pick a scope (user scope loads it in every session).

From a shell:

```
claude plugin install hud --marketplace iamsreeharims/hud
```

In the desktop app, where `/plugin` does not run: click **+** next to the prompt box, then
**Plugins**, **Add marketplace** with `iamsreeharims/hud`, then **Add plugin**.
