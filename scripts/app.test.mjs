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

test("one pilot slide displays the published MonumenTAL-6 percentages", () => {
  const { elements } = app();
  const slides = elements.cards.children.flatMap(card => card.children.filter(child => child.tag === "figure" && child.className === "study-slide"));
  assert.equal(slides.length, 1);
  const chart = slides[0].children.find(child => child.children.some(row => row.children.some(item => item.tag === "meter")));
  assert.deepEqual(chart.children.map(row => row.children.find(child => child.tag === "meter").value), [88.6, 73.1, 30.4]);
});

test("AQUILA alone has a linked PNG under its abstract", () => {
  const { elements } = app();
  const figures = elements.cards.children.flatMap(card => card.children.filter(child => child.className === "study-image"));
  assert.equal(figures.length, 1);
  assert.equal(figures[0].children[0].children[0].src, "./aquila-0112.png");
});