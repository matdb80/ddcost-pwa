import {describe,expect,it} from "vitest";import {stablePayloadHash} from "./cycle-idempotency";
describe("cycle idempotency",()=>it("uses stable hash for identical payload",()=>expect(stablePayloadHash({a:1})).toBe(stablePayloadHash({a:1}))));
