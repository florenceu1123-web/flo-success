// "@/..." 별칭 해석 훅 등록 — _aliasResolver.mjs 참고.
import { register } from "node:module";
register("./_aliasResolver.mjs", import.meta.url);
