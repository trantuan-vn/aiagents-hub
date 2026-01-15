import CTASection from "../components/home/cta-section";
import FeaturesSection from "../components/home/features-section";
import HeroSection from "../components/home/hero-section";
import PackagesPreview from "../components/home/packages-preview";
import Layout from "../components/layout/main-layout";

const Index = () => {
  return (
    <Layout>
      <HeroSection />
      <FeaturesSection />
      <PackagesPreview />
      <CTASection />
    </Layout>
  );
};

export default Index;
