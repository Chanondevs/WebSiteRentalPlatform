"use client";

import { useParams } from "next/navigation";
import { PublicWebsite } from "../../../public-website";

export default function PublicSiteSubpage() {
  const params = useParams<{ page: string }>();
  return <PublicWebsite pageSlug={params.page} />;
}
