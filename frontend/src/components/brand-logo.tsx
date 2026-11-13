/** Original UC6 logo (Figma 3:3233), rendered with its neutral backdrop masked out. */
export function BrandLogo({className='',tone='default'}:{className?:string;tone?:'default'|'light'}) {
  const src=tone==='light'?'/assets/flower-lantern-logo-footer-transparent.svg':'/assets/flower-lantern-logo-transparent.svg';
  return <img className={`brand-logo-shared ${className}`} src={src} alt="Flower Lantern Spa"/>;
}
