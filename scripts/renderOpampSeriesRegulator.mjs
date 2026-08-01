import { writeFileSync } from "node:fs";
import { renderOpampSeriesRegulatorCircuit } from "../lib/renderers/opampSeriesRegulatorCircuitRenderer.ts";

// 생성기 출력과 동일한 형태의 payload (유사/변형)
const similar = {
  vddLabel: "18V", vzLabel: "5V", rsLabel: "1kΩ",
  raLabel: "10kΩ", rbLabel: "10kΩ", voLabel: "V_o", rlLabel: "4kΩ", raUnknown: false,
};
const variant = {
  vddLabel: "24V", vzLabel: "5V", rsLabel: "1kΩ",
  raLabel: "R_a=?", rbLabel: "20kΩ", voLabel: "V_o", rlLabel: "10kΩ", raUnknown: true,
};

const svgS = renderOpampSeriesRegulatorCircuit(similar);
const svgV = renderOpampSeriesRegulatorCircuit(variant);

const html = `<!doctype html><meta charset="utf-8"><title>OPAMP 직렬 레귤레이터 렌더</title>
<style>body{margin:20px;font:14px sans-serif;background:#fff}h1{font-size:15px}.box{border:1px solid #ccc;display:inline-block;margin:6px}</style>
<h1>유사유형 (V_o=V_z(1+R_a/R_b)=10V)</h1>
<div class="box">${svgS}</div>
<h1>변형유형 (역문제: 목표 V_o=20V → R_a 도출, 점선)</h1>
<div class="box">${svgV}</div>`;
writeFileSync("scripts/renderOpampSeriesRegulator.html", html);
console.log("saved -> scripts/renderOpampSeriesRegulator.html");
