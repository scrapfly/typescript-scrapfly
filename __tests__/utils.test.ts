// import { CaseInsensitiveMap } from "../src/utils.js";

// describe("CaseInsensitiveMap", () => {
//     it("get is insensitive", () => {
//         const data = { "One": 1, "TWO": 2, "three": 3 };
//         const conv = new CaseInsensitiveMap(Object.entries(data));
//         expect(conv.get("one")).toBe(1);
//         expect(conv.get("two")).toBe(2);
//         expect(conv.get("Three")).toBe(3);
//     });
//     it("brackets are insensitive", () => {
//         const data = { "One": 1, "TWO": 2, "three": 3 };
//         const conv = new CaseInsensitiveMap(Object.entries(data));
//         expect(conv['one']).toEqual(1);
//         expect(conv["two"]).toEqual(2);
//         expect(conv["Three"]).toEqual(3);
//     });



//     it("overrides", () => {
//         const data = { "One": 3, "one": 2, "ONE": 1 };
//         const conv = new CaseInsensitiveMap(Object.entries(data));
//         expect(conv.get("one")).toBe(1);
//     });
// });