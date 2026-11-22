import { Card } from "./Card";
import { Page, PageHeader } from "./PageHeader";

export function ComingSoon({ title, description }: { title: string; description: string }) {
  return (
    <Page>
      <PageHeader title={title} />
      <Card padded><h2>Скоро</h2><p>{description}</p></Card>
    </Page>
  );
}
