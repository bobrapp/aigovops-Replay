import type { IRouter } from "express";

export type RegisteredRoute = {
  method: string;
  path: string;
};

type Layer = {
  name?: string;
  route?: {
    path: string | string[];
    methods: Record<string, boolean>;
  };
  handle?: { stack?: Layer[] };
  regexp?: RegExp;
};

function joinPath(base: string, segment: string): string {
  if (!segment) return base || "/";
  const left = base.endsWith("/") ? base.slice(0, -1) : base;
  const right = segment.startsWith("/") ? segment : `/${segment}`;
  return left + right;
}

function extractMountPath(layer: Layer): string {
  const re = layer.regexp;
  if (!re) return "";
  const src = re.source;
  if (src === "^\\/?(?=\\/|$)" || src === "^\\/?$") return "";
  const m = src.match(/^\^\\\/(.*)\\\/\?\(\?=\\\/\|\$\)$/);
  if (m) return `/${m[1].replace(/\\\//g, "/")}`;
  return "";
}

function walk(layers: Layer[], prefix: string, out: RegisteredRoute[]): void {
  for (const layer of layers) {
    if (layer.route) {
      const paths = Array.isArray(layer.route.path)
        ? layer.route.path
        : [layer.route.path];
      for (const p of paths) {
        const fullPath = joinPath(prefix, p);
        for (const method of Object.keys(layer.route.methods)) {
          if (method === "_all") continue;
          out.push({ method: method.toUpperCase(), path: fullPath });
        }
      }
    } else if (layer.name === "router" && layer.handle?.stack) {
      const mount = extractMountPath(layer);
      walk(layer.handle.stack, joinPath(prefix, mount), out);
    }
  }
}

export function listRoutes(router: IRouter, prefix = ""): RegisteredRoute[] {
  const out: RegisteredRoute[] = [];
  const stack = (router as unknown as { stack?: Layer[] }).stack;
  if (stack) walk(stack, prefix, out);
  return out;
}
