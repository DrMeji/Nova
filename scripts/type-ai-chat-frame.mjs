import fs from 'node:fs';
import ts from 'typescript';

const callPath = 'src/views/AIChat.tsx';
const framePath = 'src/views/aichat/AIChatFrame.tsx';
const callSource = ts.createSourceFile(callPath, fs.readFileSync(callPath, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const props = new Set();
const visit = (node) => {
  if (ts.isJsxSelfClosingElement(node) && node.tagName.getText(callSource) === 'AIChatFrame') {
    for (const attribute of node.attributes.properties) {
      if (ts.isJsxAttribute(attribute)) props.add(attribute.name.getText(callSource));
    }
  }
  ts.forEachChild(node, visit);
};
visit(callSource);
if (!props.size) throw new Error('Could not find AIChatFrame props in AIChat.tsx');

let frame = fs.readFileSync(framePath, 'utf8');
frame = frame.replace("import { useEffect, useState } from 'react';", "import { useEffect, useState } from 'react';\nimport type { useAIChatController } from '@/views/aichat/useAIChatController';");
frame = frame.replace(/export type AIChatFrameProps = (?:Pick[\s\S]*?\n>;|Record<string, any>;)/,
  `export type AIChatFrameProps = Pick<ReturnType<typeof useAIChatController>,\n${[...props].map((prop) => `  '${prop}'`).join(' |\n')}\n>;`);
frame = frame.replace(/\/\/ eslint-disable-next-line @typescript-eslint\/no-explicit-any\r?\n/, '');
fs.writeFileSync(framePath, frame);
console.log(`Typed ${props.size} AIChatFrame props from the controller return shape.`);
