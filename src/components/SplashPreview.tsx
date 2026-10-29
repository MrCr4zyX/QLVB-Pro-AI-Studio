const splashImage = './app-logo.png';

export default function SplashPreview() {
  return (
    <div className="fixed inset-0 z-[9999] bg-white flex flex-col items-center justify-center">
      <img
        src={splashImage}
        alt="K02 QLVB PRO"
        className="w-[260px] h-[260px] max-w-[85vw] max-h-[60dvh] shrink-0 object-contain"
      />
    </div>
  );
}