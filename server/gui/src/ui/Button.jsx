import styles from './Button.module.css'

export function Button({ children, ...props }) {
  return <button type="button" class={styles.button} {...props}>{children}</button>
}
