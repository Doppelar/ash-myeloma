import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createContext, runInContext } from "node:vm";
import test from "node:test";

function app() {
  const page = readFileSync(new URL("../public/index.html", import.meta.url), "utf8");
  const script = page.split("<script>")[1].split("</script>")[0];
  const element = tag => ({
    tag, value: "", children: [], dataset: {},
    addEventListener() {}, setAttribute() {},
    replaceChildren(...items) { this.children = items; },
    append(...items) { this.children.push(...items); },
  });
  const elements = {};
  const context = createContext({
    URL,
    location: { protocol: "file:" },
    document: { getElementById: id => elements[id] ??= element(id), createElement: element },
    localStorage: { getItem() {} },
  });
  const run = source => runInContext(source, context);
  run(script);
  return { elements, run };
}

test("initial catalog, details and drug filters", () => {
  const { elements, run } = app();
  assert.equal(elements.cards.children.length, 30);
  assert.ok(elements.cards.children.every(card => card.children.some(child => child.tag === "details")));
  run('active.products.add("I"); renderCards()');
  assert.equal(elements.cards.children.length, 4);
  run('active.population.add("I"); renderCards()');
  assert.equal(elements.cards.children.length, 2);
});

test("published years leave the bundled fallback available", () => {
  const { elements, run } = app();
  run('published[2027]={...initial,year:2027}; years()');
  assert.equal(elements.year.children.length, 2);
  assert.equal(run("catalogFor(2026).year"), 2026);
  assert.equal(run("catalogFor(2027).year"), 2027);
});
