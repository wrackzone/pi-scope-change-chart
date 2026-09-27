# Code review — pi-scope-change-chart

**Date:** 2026-09-27
**Reviewed revision:** `master` @ `f6fb497` ("added support for aggregating story count")
**Deliverable:** review notes only. No application code, config, or library file is changed by this branch.

## Scope and method

Read the full application source (`App.js` 863 lines, `pi-scope-change-chart.js` 235 lines, `_ts-string-filter.js`, `config.json`, `Gruntfile.js`, `test/`, `deploy/`, `README.md`), the git history, and the one open upstream issue. Findings that depend on library semantics were executed against real underscore/moment builds; the commands and their output are in the appendix. Nothing here was verified against a live Rally subscription, so behaviour that requires a real lookback/WSAPI response is marked as such.

The app is a Rally SDK 2.1 `TimeboxScopedApp` that renders a stacked column chart of feature scope (baseline vs added, by not-started / in-progress / completed) for a release, day by day, using Lookback API snapshots.

## Findings

### High — correctness bugs that are silently wrong

#### H1. `containsKey` is always `false`, so its caches never hit
`App.js:37-39`

```js
containsKey : function(bundle,key) {
    return (_.findIndex(_.keys(bundle),key) !== -1 )
},
```

`_.findIndex(array, predicate)` expects a function. Given a string, underscore builds a **property accessor** (`_.iteratee('prelimEstimateValues')` -> `_.property('prelimEstimateValues')`), which is then applied to *string* elements — `'prelimEstimateValues'.prelimEstimateValues` is `undefined`, so no element ever matches and the result is always `-1`.

Verified: `_.findIndex(_.keys({a:1,b:2}), 'b')` returns **-1** on underscore 1.8.3 and 1.13.8; the intended expression returns 0.

**Effect:** the guards in `_loadPreliminaryEstimateValues` (`App.js:70`) and `_loadPortfolioItemTypes` (`App.js:91`) never fire, so both WSAPI stores are re-fetched on every pipeline run instead of reusing `bundle.prelimEstimateValues` / `bundle.piTypes`. Extra round-trips per settings change; the caching code is dead weight.

**Fix:** `return _.has(bundle, key);` (or `_.keys(bundle).indexOf(key) !== -1`).

#### H2. `dateIndexes` never matches, so the sprint boundary lines are never drawn
`App.js:736-747`

```js
var normDates = _.map(dates,function(d){ return moment(d.format("M/D/YYYY"));});
_.each(range,function(day,i){
    var d = moment(day.format("M/D/YYYY"));
    var x = _.findIndex(normDates,d);          // <- object predicate
    if (x !== -1) indices.push(i);
});
```

Same class of bug as H1, but here the "predicate" is a moment *object*. Underscore treats a plain object as a matcher and compares own properties with strict equality; two distinct moment instances built from the same calendar date are never `===`, and their `_d`/`_i`/`_pf` values differ by reference.

Verified: `_.findIndex([moment('2016-05-01'), ...], moment('2016-05-01'))` returns **-1** (and also `-1` for a string predicate).

**Effect:** `bundle.iterationIndices` is always empty, `config.iterationIndices` is empty, and the grey per-iteration plot lines built at `pi-scope-change-chart.js:220-226` are never added — the sprint markers that explain the x-axis silently disappear.

**Fix:** pass a function, e.g. `_.findIndex(normDates, function(nd){ return nd.isSame(d, 'day'); })`.

#### H3. `getBaselineIndex` can return `-1`, which turns the whole chart into "all added"
`App.js:517-533`, used at `App.js:319-321`

Only the empty-iteration case is guarded. For `baselineType === 'End of first Sprint'`, the index is found by exact string match of `M/D/YYYY` against the release day array:

```js
var x = _.findIndex(range, function(r) {
    return r.format() === iterationEndDate.format();
} );
return x;        // -1 if not found
```

If the first iteration's `EndDate` does not land on a day in `dateRange(release)` — timezone/DST rounding of the ISO date, a sprint configured to end outside the release window, or an iteration whose end date precedes the release start — this returns `-1`. That `-1` propagates:

- `bundle.baseline = _.clone(bundle.data[-1])` -> `undefined`;
- in `_categorize`, `_.findIndex(undefined, fn)` returns `-1` (verified — it does **not** throw), so `scopeFunction` returns `"Added"` for every feature on every day;
- the red baseline marker is drawn at `x = -1` (`pi-scope-change-chart.js:227-232`).

**Effect:** no error, no crash — the chart renders a plausible-looking picture in which 100% of scope is "added" and nothing is baseline. This is the most dangerous failure mode in the file because it is invisible.

**Fix:** guard the lookup (`return x === -1 ? 0 : x;`) *and* repair in `_setBaseline` when `bundle.baseline` is undefined, e.g. fall back to `bundle.data[0]` and log a warning.

### Medium — fragility, shared state, and scaling

#### M1. Prototype-level chart config is mutated per instance
`pi-scope-change-chart.js:198-235`, esp. 209, 220-232

```js
this.chartData = config.chartData;
this.chartConfig.xAxis.plotLines = _.map(config.iterationIndices, ...);
this.chartConfig.xAxis.plotLines.push({ ... config.baselineIndex });
```

`chartConfig` and `chartData` are class-body properties, i.e. they live on the prototype; assigning `this.chartConfig.xAxis.plotLines` writes through to the shared object. `this.chartData = config.chartData` is also redundant since Ext already applies `config` to the instance.

The click handler is worse: `plotOptions.series.point.events.click` fires `scope_change_chart.fireEvent("series_click", this)` through the **module-global** assigned in the constructor (`var scope_change_chart = null;` at line 1, set at line 207). With two charts on a page, whichever was constructed last receives every click.

**Fix:** copy the config per instance (`Ext.apply({}, this.chartConfig, config)` / build `plotLines` into a local object) and dispatch through the component, e.g. `this.up('chart').fireEvent('series_click', this.point)`.

#### M2. Module-global `app` instead of `this`
`App.js:1`, assigned in `onScopeChange` (`App.js:465`), then read by nearly every method (`44, 59, 66, 70, 91, 94, 112, 137, 165, 172, 182, 185, 197, 229, 234, 263, 276, 283, 309, 319, 323, 336, 367, 382, 384, 426, 429, 433, 438, 442, 465, 487, 491, 522, 525, 542, 594, 635, 642, 673, 684, 854, 855, 861`).

Any second app instance (or a callback from an older instance) reads and writes another instance's state, and none of these methods can be unit-tested without a global. Prefer `var me = this` captured per method, or bind the chain with `Deft.Chain.pipeline([...], this)`.

#### M3. Scope-change view mutates the snapshot records
`App.js:551-567`

```js
var f = findit(previousFeatures,fid);
f["Scope"] = "Removed";     // mutates the shared feature object
```

These feature objects are the same references held in `bundle.data` (they were pulled from the snapshot store and reused across days and series), so the injected `Scope` field leaks into other views and persists across interactions.

**Fix:** copy before annotating: `_.extend({}, f, {Scope: 'Added'})`.

#### M4. Most chain steps have no `failure` handler, and the mask can never be cleared
`App.js:471-493`; mask calls at `App.js:66, 276, 382, 426`

Only `_loadReleases` (125) and `_loadIterations` (156) handle rejection. `_getSnapshots` (lookback) and `_queryFeatures` (WSAPI) do not. `showMask` is called before the snapshots are processed and `hideMask` only in `_createChart`, so **any** rejection after the first mask leaves the app permanently masked, and the pipeline `failure` handler just appends `{text: res}` without unmasking.

**Fix:** per-step `failure` handlers, or a single pipeline failure that calls `app.hideMask()` and renders the message.

#### M5. Unbounded OR filter from the selected feature set
`App.js:654-667`

One OR clause per feature is appended to build the tree-store filter. A large series produces a query string with thousands of clauses — slow WSAPI calls, and eventually a URL-length failure.

**Fix:** build the filter once from an `ObjectID` set (chunk + merge) rather than chaining `.or()` per record.

#### M6. `limit: Infinity` combined with an O(days x snapshots) pass
`App.js:199`, `App.js:248`, `App.js:288-300`

Every day iterates the entire snapshot array with `_.filter`, then re-groups and re-sorts it. For a 90-day increment with a few thousand features this is millions of comparisons in the browser on each settings change, and the whole snapshot set is held in memory. Sorting snapshots once and walking them by validity range would make this roughly linear.

#### M7. The test/lint setup gives false confidence
`Gruntfile.js:33-35`, `test/AppSpec.js`, `.travis.yml`, `package.json`

- JSHint is configured for `test/**/*.js` only, so the 1,100 lines of application code are never linted.
- The only spec is `expect(true).toBe(true)`.
- CI pins `node_js: 0.10.1` (EOL 2016) with grunt ~0.4.1 / grunt-contrib-jasmine 0.4.x and no lockfile.

The three high-severity bugs above are exactly the kind a single fixture-driven spec over `dateIndexes`, `containsKey` and `getBaselineIndex` would have caught, since all three are pure functions of arrays.

#### M8. Existing open issue is consistent with the tooltip code path
Upstream issue #2 ("Seems like the Hover Over Completed is switched with In Progress", opened 2017-10-18, still open).

I traced the tooltip (`pi-scope-change-chart.js:50-175`): the totals are `ts = bs + as`, `tip = bsip + asip`, `tc = bsc + asc`, mapped to `tnsp/tipp/tcp` in the row that labels them NotStarted / In-Progress / Completed, and the substring matching (`"InProgress"`, `"Completed"`) cannot cross-match the six series names. I could not reproduce the swap from source alone.

The likeliest source of a real "swapped" impression is the category derivation at `App.js:347-353`: a feature counts as completed as soon as its latest snapshot has a non-empty `ActualEndDate`, and as in-progress from `ActualStartDate`; if lookback returns those fields on a different snapshot than the code assumes (or `_ValidTo`/same-day grouping picks a different snapshot — see `App.js:296-298`), the segments move between the two rows. Combined with M1 (shared formatter state across instances), that is enough to produce the reported symptom.

**Suggested next step:** capture a small real snapshot payload as a test fixture, assert the day-by-day categories, and only then treat the tooltip as suspect. That is also the cheapest way to lock in fixes for H1-H3.

### Low — hygiene

- **L1. `README.md`:** two identical `## Overview` headings. The license paragraph says "AppTemplate is released under the MIT license" while `LICENSE` is a bare "Copyright (c) 2002-2012 All Rights Reserved." plus MIT text with no copyright holder — the file, not the app, is documented.
- **L2. `package.json`:** still the template's `"name": "MyApp"` (version 0.1.1), no description/repository fields, devDependencies only.
- **L3. Debug residue:** ~15 `console.log` calls on production paths (`App.js:42, 67, 88, 109, 133, 179, 183, 207, 209, 223, 256, 466, 490`; `pi-scope-change-chart.js:214`) plus large commented-out blocks (`App.js:30-34, 36, 189-193, 258, 265-268, 311, 355-360, 408-409, 605, 683, 696`; `pi-scope-change-chart.js:12, 16, 24-26, 55, 183, 205, 211`).
- **L4. Off-by-one against the comment:** `App.js:398-403` says "return null value for future dates" but blanks only `x > bundle.todayIndex + 1`, leaving one future day populated.
- **L5. Frozen vendored libraries:** `lib/moment.min.js` is 2.10.6 (2015) and timezone rules come from `moment-timezone-with-data-2010-2020` — embedded data ends in 2020, so any date after that resolves with the last known offsets. `require.js` is vendored but nothing in `config.json` uses AMD.
- **L6. Release lookup ignores project scope:** `App.js:112-120` filters releases by `Name` only, then `_getSnapshots` puts *all* matches into the `$in`, so releases with the same name in sibling projects contribute features; the project match at `App.js:226-230` is computed but never used to narrow the query.
- **L7. `_ts-string-filter.js`:** `_createQueryString(property, operator, value)` ignores all three arguments and re-parses `this.query_string`, so the override only behaves for the one call site that uses it and would misbehave if the filter were used normally.
- **L8. Click lookup trusts array indexing:** `App.js:541` reads `s.data[x]` positionally; if a series' point array ever diverges from `x` (dropped null points, partial series) the "Change" grid shows another day's features. Safer to look up the point whose `x` matches.

## Suggested order of work

1. H1, H2, H3 — small, local, pure-function fixes; add specs for each.
2. M4 (mask/failure handling) and M3 (record mutation) — user-visible robustness.
3. M1/M2 — needed before any second chart instance or test harness is viable.
4. M5-M7, then the lint/test scaffolding that keeps the above from regressing.

## Appendix — verification

Library semantics were checked with real builds rather than assumed:

```
$ npm install underscore@1.8.3 underscore-latest@npm:underscore@latest moment@2.10.6
underscore 1.8.3 (v1.8.3) / underscore latest (v1.13.8), identical results:
  _.findIndex(_.keys({prelimEstimateValues:..,piTypes:..}), 'prelimEstimateValues') = -1
  _.keys(bundle).indexOf('prelimEstimateValues')                                     =  0
  _.findIndex([moment('2016-05-01'),moment('2016-05-02'),moment('2016-06-30')],
              moment('2016-05-01'))                                                  = -1
  _.findIndex(range, r => r.format() === target.format())   [function predicate]     =  0
  _.findIndex(undefined, () => true)                                                 = -1   (no throw)
```

```
$ gh pr list --repo wrackzone/pi-scope-change-chart --state all
1  Get up to date.  RallyCommunity:master  MERGED  2016-10-21
2  Seems like the Hover Over Completed is switched with In Progress  OPEN  2017-10-18
```

Not verified: anything requiring a live Rally subscription (lookback snapshot shapes, WSAPI filter limits, the tooltip issue in practice).
