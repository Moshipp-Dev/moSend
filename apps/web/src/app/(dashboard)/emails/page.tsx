"use client";

import EmailList from "./email-list";
import { H1 } from "@usesend/ui";

export default function EmailsPage() {
  return (
    <div>
      <div className="flex justify-between items-center">
        <H1>Correos</H1>
      </div>
      <EmailList />
    </div>
  );
}
