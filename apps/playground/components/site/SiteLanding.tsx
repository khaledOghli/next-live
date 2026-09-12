import { SiteHeader } from './SiteHeader';
import { SiteFooter } from './SiteFooter';
import { Hero } from './Hero';
import { ShowcaseSection } from './ShowcaseSection';
import { FeatureGrid } from './FeatureGrid';

export function SiteLanding() {
  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader active="home" />
      <main className="flex-1">
        <Hero />
        <ShowcaseSection />
        <FeatureGrid />
      </main>
      <SiteFooter />
    </div>
  );
}
