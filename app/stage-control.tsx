import React from "react";
import { Redirect } from "expo-router";

// Stage screen removed per user specification; redirects smoothly to dashboard
export default function StageControlScreen() {
  return <Redirect href="/" />;
}
