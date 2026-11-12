import { Entity, PrimaryColumn, Column, OneToMany } from 'typeorm';
import { TaiKhoanQuyen } from './tai-khoan-quyen.entity';

@Entity({ schema: 'dbo', name: 'quyen' })
export class Quyen {
  @PrimaryColumn({ name: 'maquyen', type: 'char', length: 10 })
  maQuyen!: string;

  @Column({ name: 'tenquyen', type: 'varchar', length: 100, unique: true })
  tenQuyen!: string;

  @OneToMany(() => TaiKhoanQuyen, (tq) => tq.quyen)
  taiKhoanQuyens?: TaiKhoanQuyen[];
}
