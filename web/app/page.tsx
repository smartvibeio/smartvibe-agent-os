import Link from "next/link";
import styles from "./home.module.css";

export default function HomePage() {
  return (
    <main className={styles.page}>
      <section className={styles.card} aria-labelledby="home-title">
        <div className={styles.brand}>SmartVibe</div>
        <header className={styles.heading}>
          <h1 id="home-title">你的专属交易陪练</h1>
          <p>AI私教 + 行为复盘，帮你看清每一次交易</p>
        </header>
        <section className={styles.value} aria-labelledby="value-title">
          <h2 id="value-title">为什么不同？</h2>
          <p>通过Agent洞察你的交易习惯，发现你的交易弱点，实时指导你的每一笔模拟交易。</p>
        </section>
        <Link className={styles.start} href="/coach">建立分身</Link>
        <p className={styles.privacy}>记录保存在本地 · Agent结合大模型提供陪练支持</p>
      </section>
    </main>
  );
}
