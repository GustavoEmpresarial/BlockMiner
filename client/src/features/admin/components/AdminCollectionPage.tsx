import type { ReactNode } from 'react';

type Props = {
  title: string;
  children?: ReactNode;
};

export default function AdminCollectionPage({ title, children }: Props) {
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-black text-white">{title}</h1>
      {children}
    </div>
  );
}
