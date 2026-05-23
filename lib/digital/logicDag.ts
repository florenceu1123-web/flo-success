// src/lib/digital/logicDag.ts

export type GateType =
  | "AND"
  | "OR"
  | "XOR"
  | "NAND"
  | "NOR"
  | "XNOR"
  | "NOT";

export type LogicNode =
  | {
      id: string;
      kind: "input" | "function";
      label: string;
    }
  | {
      id: string;
      kind: "gate";
      gate: GateType;
      inputs: string[];
      label?: string;
    }
  | {
      id: string;
      kind: "output";
      inputs: string[];
      label: string;
    };

export type LogicDAG = {
  nodes: LogicNode[];
  outputId: string;
};

export const exampleDag: LogicDAG = {
  outputId: "Z",
  nodes: [
    { id: "f1", kind: "function", label: "f_1" },
    { id: "f2", kind: "function", label: "f_2" },
    { id: "f3", kind: "function", label: "f_3" },
    { id: "f4", kind: "function", label: "f_4" },

    { id: "X", kind: "gate", gate: "AND", inputs: ["f1", "f2"] },
    { id: "Y", kind: "gate", gate: "OR", inputs: ["f3", "f4"] },

    { id: "Z", kind: "gate", gate: "XOR", inputs: ["X", "Y"] },
  ],
};
