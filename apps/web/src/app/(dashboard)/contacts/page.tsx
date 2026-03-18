"use client";

import AddContactBook from "./add-contact-book";
import ContactBooksList from "./contact-books-list";
import { H1 } from "@usesend/ui";

export default function ContactsPage() {
  return (
    <div>
      <div className="flex justify-between items-center">
        <H1>Libretas de contactos</H1>
        <AddContactBook />
      </div>
      <ContactBooksList />
    </div>
  );
}
