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
      "html": "<img src="￼_0_">",
    }
  `);
});
