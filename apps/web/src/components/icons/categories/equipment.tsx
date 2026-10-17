import { CategoryIconBase, type CategoryIconProps } from './icon-base';

/**
 * Sealing equipment.
 *
 * The one machine in a set of vessels, which is exactly the problem: it has to
 * read as "a device" without borrowing the gear/cog vocabulary that would make
 * it look like a settings icon. Drawn as a press — a head above a bed with a
 * cup between them — so the silhouette says what it does rather than that it is
 * mechanical.
 */
export function SealingEquipmentIcon(props: CategoryIconProps) {
  return (
    <CategoryIconBase {...props}>
      <path d="M4.5 4.5h15v3.5h-15z" />
      <path d="M4.5 19.5h15" />
      <path d="M9.5 11h5l-.5 5.5h-4z" />
    </CategoryIconBase>
  );
}
