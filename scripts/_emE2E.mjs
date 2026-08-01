async function gen(mode){
  const body={image:"d",subject:"electromagnetics",mode,count:1,topicKey:"gauss_law",
    analysis:{topic:"무한 면전하 전속밀도 전위차 등전위 일",interpretation:"z=0 무한평면 면전하밀도, 점 A B C, 전속 밀도 D, 점 B와 점 A의 전위차 V_BA, 점 B와 C가 등전위가 되기 위한 z=n, 점전하를 점 B에서 점 A로 이동시키는 데 필요한 일",relatedConcepts:["전위차","등전위","전속밀도","일"],fillInTheBlanks:[],subjectKey:"electromagnetics"}};
  const r=await fetch("http://localhost:3000/api/generate",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
  const d=await r.json();const p=d.problems?.[0];
  console.log(`[${mode}] status=${r.status} issues=${d.summary?.totalIssues} fig=${(p?.figureVariants||[]).map(f=>f.diagramType).join(",")}`);
  console.log("  Q:",(p?.question||"").split("\n").join(" | "));
  console.log("  A:",(p?.answer||"").split("\n").join(" | "));
  const f=p?.figureVariants?.[0]; if(f) require("node:fs").writeFileSync("scripts/_emfig.json",JSON.stringify(f));
  return p;
}
await gen("exam_similar"); await gen("exam_variant");
