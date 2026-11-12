import { Entity, PrimaryColumn, ManyToOne, JoinColumn } from 'typeorm';
import { TaiKhoan } from './tai-khoan.entity';
import { Quyen } from './quyen.entity';

@Entity({ schema: 'dbo', name: 'taikhoanquyen' })
export class TaiKhoanQuyen {
  @PrimaryColumn({ name: 'mataikhoan', type: 'char', length: 10 })
  maTaiKhoan!: string;

  @PrimaryColumn({ name: 'maquyen', type: 'char', length: 10 })
  maQuyen!: string;

  @ManyToOne(() => TaiKhoan, (tk) => tk.taiKhoanQuyens, { onDelete: 'NO ACTION' })
  @JoinColumn({ name: 'mataikhoan' })
  taiKhoan?: TaiKhoan;

  @ManyToOne(() => Quyen, (q) => q.taiKhoanQuyens, { onDelete: 'NO ACTION' })
  @JoinColumn({ name: 'maquyen' })
  quyen?: Quyen;
}
