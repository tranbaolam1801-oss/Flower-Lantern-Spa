import { Entity, PrimaryColumn, ManyToOne, JoinColumn } from 'typeorm';
import { TaiKhoan } from './tai-khoan.entity';
import { Quyen } from './quyen.entity';

@Entity({ name: 'TaiKhoanQuyen' })
export class TaiKhoanQuyen {
  @PrimaryColumn({ name: 'MaTaiKhoan', type: 'char', length: 10 })
  maTaiKhoan!: string;

  @PrimaryColumn({ name: 'MaQuyen', type: 'char', length: 10 })
  maQuyen!: string;

  @ManyToOne(() => TaiKhoan, (tk) => tk.taiKhoanQuyens, { onDelete: 'NO ACTION' })
  @JoinColumn({ name: 'MaTaiKhoan' })
  taiKhoan?: TaiKhoan;

  @ManyToOne(() => Quyen, (q) => q.taiKhoanQuyens, { onDelete: 'NO ACTION' })
  @JoinColumn({ name: 'MaQuyen' })
  quyen?: Quyen;
}
