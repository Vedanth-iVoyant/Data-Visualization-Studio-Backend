// src/database/postgres/history/entities/history.entity.ts
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  CreateDateColumn,
  UpdateDateColumn,
  JoinColumn,
  Index,
} from 'typeorm';
import { User } from '../../auth/entities/user.entity';

@Entity('histories')
@Index(['userId', 'createdAt']) // keep this compound index
export class History {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 255 })
  title: string;

  @Column({ nullable: true, length: 255 })
  fileName: string;

  @Column({ unique: true })
  mongoId: string;

  @Column({ type: 'uuid' })
  @Index()
  userId: number;

  @ManyToOne(() => User, (user) => user.histories, {
    onDelete: 'CASCADE',
    eager: false,
  })
  @JoinColumn({ name: 'userId' })
  user: User;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
