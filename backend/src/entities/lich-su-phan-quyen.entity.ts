import { Entity, PrimaryColumn, Column, ManyToOne, JoinColumn } from 'typeorm';
import { TaiKhoan } from './tai-khoan.entity';

@Entity({ schema: 'dbo', name: 'lichsuphanquyen' })
export class LichSuPhanQuyen {
  @PrimaryColumn({ name: 'malichsu', type: 'char', length: 10 })
  maLichSu!: string;

  @Column({ name: 'mataikhoanthuchien', type: 'char', length: 10 })
  maTaiKhoanThucHien!: string;

  @Column({ name: 'mataikhoanduocphanquyen', type: 'char', length: 10 })
  maTaiKhoanDuocPhanQuyen!: string;

  @Column({ name: 'thoidiem', type: 'timestamp', precision: 3 })
  thoiDiem!: Date;

  @Column({ name: 'noidungthaydoi', type: 'varchar', length: 500, nullable: true })
  noiDungThayDoi?: string;

  @ManyToOne(() => TaiKhoan)
  @JoinColumn({ name: 'mataikhoanthuchien' })
  taiKhoanThucHien?: TaiKhoan;

  @ManyToOne(() => TaiKhoan)
  @JoinColumn({ name: 'mataikhoanduocphanquyen' })
  taiKhoanDuocPhanQuyen?: TaiKhoan;
}
