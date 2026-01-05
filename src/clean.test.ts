import { expect, test } from "vitest";
import { process } from "./clean.ts";

expect.addSnapshotSerializer({
  test: (val) => val && val instanceof File,
  serialize: (file: File) => `File ${file.name}: ${file.size} bytes`,
});

test("sanity check", () => {
  expect(process("<div><p>Hello world!</p></div>")).toMatchInlineSnapshot(`
    {
      "files": [],
      "html": "<p>Hello world!</p>",
    }
  `);
});

test("base 64 image extraction", () => {
  expect(
    process(
      '<div><img src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAAD0lEQVR4AQEEAPv/AP9EAAOJAUSHQ2JJAAAAAElFTkSuQmCC" alt="Red dot"/></div>',
    ),
  ).toMatchInlineSnapshot(`
    {
      "files": [
        File ￼_0_: 72 bytes,
      ],
      "html": "<p><img src="￼_0_"></p>",
    }
  `);
});

test("basic html cleanup", () => {
  expect(
    process(
      `<div>
        <a href="https://example.com"><strong>Click here</strong></a>
        to visit
        <span style="font-weight: 700;">our site</span>!
      </div>`,
    ),
  ).toMatchInlineSnapshot(`
    {
      "files": [],
      "html": "<p>
            <a href="https://example.com"><strong>Click here</strong></a>
            to visit
            <strong>our site</strong>!
          </p>",
    }
  `);
});
