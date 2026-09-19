import App from "../app";

import "@/app/globals.css";

function pathFromSlug(slug: string[] | undefined): string {
  if (!slug?.length) return "/";
  return `/${slug.map((segment) => decodeURIComponent(segment)).join("/")}`;
}

function queryStringFromSearchParams(searchParams: Record<string, string | string[] | undefined>): string {
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(searchParams)) {
    if (Array.isArray(value)) {
      for (const item of value) qs.append(key, item);
    } else if (value != null) {
      qs.set(key, value);
    }
  }
  const encoded = qs.toString();
  return encoded ? `?${encoded}` : "";
}

export default async function CatchAll({
  params,
  searchParams,
}: {
  params: Promise<{ slug?: string[] }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { slug } = await params;
  const query = await searchParams;
  return <App ssrLocation={`${pathFromSlug(slug)}${queryStringFromSearchParams(query)}`} />;
}
